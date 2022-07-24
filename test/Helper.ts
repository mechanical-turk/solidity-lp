import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, ContractReceipt } from "ethers";
import { ethers } from "hardhat";
import {
  LiquidityPool,
  LiquidityPool__factory,
  Router__factory,
  SpaceCoin,
  SpaceCoin__factory,
} from "../typechain/index";

export enum Phase {
  SEED,
  GENERAL,
  OPEN,
}

export const ONE_ETHER = ethers.utils.parseEther("1");

export const MIN_LIQUIDITY = 1_000;

export function sqrt(y: BigNumber): BigNumber {
  let z = BigNumber.from("0");
  if (y.gt(3)) {
    z = y;
    let x = y.div(2).add(1);
    while (x.lt(z)) {
      z = x;
      x = y.div(x).add(x).div(2);
    }
  } else if (!y.eq(0)) {
    z = BigNumber.from("1");
  }
  return z;
}

export class Helper {
  constructor(
    public readonly spaceCoinFactory: SpaceCoin__factory,
    public readonly liquidityPoolFactory: LiquidityPool__factory,
    public readonly routerFactory: Router__factory,
    public readonly signers: {
      readonly deployer: SignerWithAddress;
      readonly alice: SignerWithAddress;
      readonly bob: SignerWithAddress;
      readonly charlie: SignerWithAddress;
      readonly dan: SignerWithAddress;
      readonly treasury: SignerWithAddress;
      readonly others: SignerWithAddress[];
    },
    private readonly secretSigner: SignerWithAddress // used only internally from within the helper
  ) {}

  static async init(): Promise<Helper> {
    const [
      deployer,
      alice,
      bob,
      charlie,
      dan,
      treasury,
      secretSigner,
      ...others
    ] = await ethers.getSigners();
    const spaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
    const liquidityPoolFactory = await ethers.getContractFactory(
      "LiquidityPool"
    );
    const routerFactory = await ethers.getContractFactory("Router");
    return new Helper(
      spaceCoinFactory,
      liquidityPoolFactory,
      routerFactory,
      {
        deployer,
        alice,
        bob,
        charlie,
        dan,
        treasury,
        others,
      },
      secretSigner
    );
  }

  async createFreshProject() {
    const spaceCoin = await this.spaceCoinFactory
      .connect(this.signers.alice)
      .deploy(this.signers.treasury.address);
    return spaceCoin;
  }

  async createLPWithInitialLiquidity(params: {
    spcIn: BigNumber;
    ethIn: BigNumber;
    provider?: SignerWithAddress;
  }) {
    const spaceCoin = await this.createFreshProject();
    const { liquidityPool, router } = await this.deployLPContracts({
      spaceCoin,
    });
    await spaceCoin.connect(this.signers.alice).advancePhaseFrom(Phase.SEED);
    await spaceCoin.connect(this.signers.alice).advancePhaseFrom(Phase.GENERAL);
    if (params.provider) {
      await spaceCoin
        .connect(this.signers.treasury)
        .transfer(params.provider.address, params.spcIn);
    }
    const provider = params.provider || this.signers.treasury;
    await spaceCoin
      .connect(provider)
      .approve(liquidityPool.address, params.spcIn);
    await router.connect(provider).addLiquidity(params.spcIn, 1, {
      value: params.ethIn,
    });
    return {
      spaceCoin,
      router,
      liquidityPool,
    };
  }

  async deployLPContracts(params: { spaceCoin: SpaceCoin }) {
    const liquidityPool = await this.liquidityPoolFactory
      .connect(this.signers.alice)
      .deploy(params.spaceCoin.address);
    const router = await this.routerFactory
      .connect(this.signers.alice)
      .deploy(liquidityPool.address);
    return {
      liquidityPool,
      router,
    };
  }

  async getGasCost(receipt: ContractReceipt) {
    return BigNumber.from(receipt.cumulativeGasUsed).mul(
      receipt.effectiveGasPrice
    );
  }

  async getBalances(params: {
    spaceCoin: SpaceCoin;
    liquidityPool: LiquidityPool;
    address: string;
  }) {
    return {
      eth: await ethers.provider.getBalance(params.address),
      spaceCoin: await params.spaceCoin
        .connect(params.address)
        .balanceOf(params.address),
      lp: await params.liquidityPool
        .connect(params.address)
        .balanceOf(params.address),
    };
  }

  async partiallyFundProject(params: {
    spaceCoin: SpaceCoin;
    investors: SignerWithAddress[];
    totalInvestment: BigNumber;
  }) {
    const investingPerPerson = params.totalInvestment.div(
      params.investors.length
    );
    const remainder: BigNumber = params.totalInvestment.mod(
      params.investors.length
    );
    await params.spaceCoin
      .connect(this.signers.alice)
      .advancePhaseFrom(Phase.SEED);
    await params.spaceCoin
      .connect(this.signers.alice)
      .advancePhaseFrom(Phase.GENERAL);
    for (const investor of params.investors) {
      await params.spaceCoin.connect(investor).invest({
        value: investingPerPerson,
      });
    }
    if (remainder.gt(0)) {
      await params.spaceCoin.connect(params.investors[0]).invest({
        value: remainder,
      });
    }
  }
}
