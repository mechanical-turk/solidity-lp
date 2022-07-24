import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { LiquidityPool, Router, SpaceCoin } from "../typechain";
import { Helper, MIN_LIQUIDITY, ONE_ETHER, sqrt } from "./Helper";

describe("Liquidity Pool", () => {
  let helper: Helper;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dan: SignerWithAddress;
  let treasury: SignerWithAddress;
  let others: SignerWithAddress[];

  beforeEach(async () => {
    helper = await Helper.init();
    const { signers } = helper;
    alice = signers.alice;
    bob = signers.bob;
    charlie = signers.charlie;
    dan = signers.dan;
    treasury = signers.treasury;
    others = signers.others;
  });

  describe("withdrawing", () => {
    let investors: SignerWithAddress[];
    let spaceCoin: SpaceCoin;

    const INVESTMENT = ONE_ETHER.mul(20_000);

    beforeEach(async () => {
      investors = [bob, charlie, dan];
      spaceCoin = await helper.createFreshProject();
      await helper.partiallyFundProject({
        spaceCoin,
        totalInvestment: INVESTMENT,
        investors,
      });
    });

    it("should not allow anyone other than the owner to withdraw", async () => {
      for (const signer of others) {
        await expect(spaceCoin.connect(signer).withdraw()).to.be.revertedWith(
          "owner only"
        );
      }
    });

    it("should allow the owner to withdraw", async () => {
      await expect(spaceCoin.connect(alice).withdraw()).to.not.be.reverted;
    });

    it("should transfer all the funds into the treasury on withdrawal", async () => {
      const balanceBefore = await ethers.provider.getBalance(treasury.address);
      await spaceCoin.connect(alice).withdraw();
      const balanceAfter = await ethers.provider.getBalance(treasury.address);
      const diff = balanceAfter.sub(balanceBefore);
      expect(diff).to.equal(INVESTMENT);
    });

    it("should emit a Withdrawal event on withdrawal", async () => {
      await expect(spaceCoin.connect(alice).withdraw())
        .to.emit(spaceCoin, "Withdrawal")
        .withArgs(INVESTMENT);
    });
  });

  describe("Swapping ETH for SpaceCoins", async () => {
    let spaceCoin: SpaceCoin;
    let router: Router;
    let liquidityPool: LiquidityPool;
    let traders: SignerWithAddress[];

    const INITIAL_SPC = ONE_ETHER.mul(50);
    const INITIAL_ETH = ONE_ETHER.mul(10);

    const ETH_IN_FIRST_TRADE = ONE_ETHER;

    /**
     * ethIn after fees = dX = ONE_ETHER * 0.99 = 0.99 ETH
     * dY = (Y * dX) / (x + dX)
     * = (50 * 0.99) / (10 + 0.99)
     * = 4.50409463148 SPC (before tax)
     *
     * after tax SPC = 4.50409463148 * 0.98 = 4.41401273885
     *
     * to Wei = 4414012738853503184.71337579617834394904458598726114649681528
     *
     * rounded = 4414012738853503185
     */

    const SPC_OUT_FROM_POOL_AFTER_FIRST_TRADE = BigNumber.from(
      "4504094631483166515"
    );
    const SPC_RECEIVED_AFTER_FIRST_TRADE = BigNumber.from(
      "4414012738853503185"
    );

    beforeEach(async () => {
      const contracts = await helper.createLPWithInitialLiquidity({
        spcIn: INITIAL_SPC,
        ethIn: INITIAL_ETH,
      });
      spaceCoin = contracts.spaceCoin;
      router = contracts.router;
      liquidityPool = contracts.liquidityPool;
      const INITIAL_TRADER_SPC_BALANCE = ONE_ETHER.mul(2);
      traders = [bob, charlie, dan];
      for (const trader of traders) {
        await spaceCoin
          .connect(treasury)
          .transfer(trader.address, INITIAL_TRADER_SPC_BALANCE);
        await spaceCoin
          .connect(trader)
          .approve(liquidityPool.address, INITIAL_TRADER_SPC_BALANCE);
      }
    });

    describe("with tax", () => {
      beforeEach(async () => {
        await spaceCoin.connect(alice).toggleTax(true);
      });

      it("should emit a Swap event on a successful trade", async () => {
        await expect(
          router.connect(bob).swapExactEthForTokens(1, {
            value: ETH_IN_FIRST_TRADE,
          })
        )
          .to.emit(liquidityPool, "Swap")
          .withArgs(
            bob.address,
            ETH_IN_FIRST_TRADE,
            0,
            0,
            SPC_RECEIVED_AFTER_FIRST_TRADE
          );
      });

      it("should succeed if the trade is exactly equal to the min", async () => {
        await expect(
          router
            .connect(bob)
            .swapExactEthForTokens(SPC_RECEIVED_AFTER_FIRST_TRADE, {
              value: ETH_IN_FIRST_TRADE,
            })
        ).to.not.be.reverted;
      });

      it("should revert even if the trade is off by 1 wei", async () => {
        await expect(
          router
            .connect(bob)
            .swapExactEthForTokens(SPC_RECEIVED_AFTER_FIRST_TRADE.add(1), {
              value: ETH_IN_FIRST_TRADE,
            })
        ).to.be.reverted;
      });

      it("should remove pre-tax SPC from the pool", async () => {
        const balanceBefore = await spaceCoin.balanceOf(liquidityPool.address);
        await router
          .connect(bob)
          .swapExactEthForTokens(SPC_RECEIVED_AFTER_FIRST_TRADE, {
            value: ETH_IN_FIRST_TRADE,
          });
        const balanceAfter = await spaceCoin.balanceOf(liquidityPool.address);
        expect(balanceAfter.add(SPC_OUT_FROM_POOL_AFTER_FIRST_TRADE)).equal(
          balanceBefore
        );
      });

      it("should add the ETH to the pool's balance", async () => {
        const balanceBefore = await ethers.provider.getBalance(
          liquidityPool.address
        );
        await router
          .connect(bob)
          .swapExactEthForTokens(SPC_RECEIVED_AFTER_FIRST_TRADE, {
            value: ETH_IN_FIRST_TRADE,
          });
        const balanceAfter = await ethers.provider.getBalance(
          liquidityPool.address
        );
        expect(balanceAfter.sub(ETH_IN_FIRST_TRADE)).equal(balanceBefore);
      });

      it("should add the SPC to the trader's balance", async () => {
        const balanceBefore = await spaceCoin.balanceOf(bob.address);
        await router
          .connect(bob)
          .swapExactEthForTokens(SPC_RECEIVED_AFTER_FIRST_TRADE, {
            value: ETH_IN_FIRST_TRADE,
          });
        const balanceAfter = await spaceCoin.balanceOf(bob.address);
        expect(balanceBefore.add(SPC_RECEIVED_AFTER_FIRST_TRADE)).equal(
          balanceAfter
        );
      });
    });

    describe.skip("without tax", () => {
      it("should fail", async () => {
        expect(true).to.be.false;
      });
    });
  });

  describe("Swapping SpaceCoins for ETH", async () => {
    let spaceCoin: SpaceCoin;
    let router: Router;
    let liquidityPool: LiquidityPool;
    let traders: SignerWithAddress[];

    const INITIAL_SPC = ONE_ETHER.mul(50);
    const INITIAL_ETH = ONE_ETHER.mul(10);

    const SPC_OUT_FROM_TRADER = ONE_ETHER;

    const SPC_RECEIVED = BigNumber.from("980000000000000000");

    /**
     * spc in after taxes = 1 * 0.98 = 0.98
     * spcIn after fees = 0.98 * 0.99 = 0.9702
     *
     * dY = (Y * dX) / (x + dX)
     * = (10 * 0.9702) / (50 + 0.9702)
     * = 0.1903465161996617631478785643375933388528983602183236479354603277 ETH
     * = 190346516199661763.147878564337593338852898360218323647935460 WEI
     * rounded = 190346516199661763 WEI
     */

    const ETH_OUT_FROM_POOL_AFTER_FIRST_TRADE =
      BigNumber.from("190346516199661763");

    beforeEach(async () => {
      const contracts = await helper.createLPWithInitialLiquidity({
        spcIn: INITIAL_SPC,
        ethIn: INITIAL_ETH,
      });
      spaceCoin = contracts.spaceCoin;
      router = contracts.router;
      liquidityPool = contracts.liquidityPool;
      const INITIAL_TRADER_SPC_BALANCE = ONE_ETHER.mul(2);
      traders = [bob, charlie, dan];
      for (const trader of traders) {
        await spaceCoin
          .connect(treasury)
          .transfer(trader.address, INITIAL_TRADER_SPC_BALANCE);
        await spaceCoin
          .connect(trader)
          .approve(liquidityPool.address, INITIAL_TRADER_SPC_BALANCE);
      }
    });

    describe("with tax", () => {
      beforeEach(async () => {
        await spaceCoin.connect(alice).toggleTax(true);
      });

      it("should emit a Swap event on a successful trade", async () => {
        await expect(
          router.connect(bob).swapExactTokensForEth(SPC_OUT_FROM_TRADER, 1)
        )
          .to.emit(liquidityPool, "Swap")
          .withArgs(
            bob.address,
            0,
            ETH_OUT_FROM_POOL_AFTER_FIRST_TRADE,
            SPC_OUT_FROM_TRADER,
            0
          );
      });

      it("should succeed if the trade is exactly equal to the min", async () => {
        await expect(
          router
            .connect(bob)
            .swapExactTokensForEth(
              SPC_OUT_FROM_TRADER,
              ETH_OUT_FROM_POOL_AFTER_FIRST_TRADE
            )
        ).to.not.be.reverted;
      });

      it("should revert even if the trade is off by 1 wei", async () => {
        await expect(
          router
            .connect(bob)
            .swapExactTokensForEth(
              SPC_OUT_FROM_TRADER,
              ETH_OUT_FROM_POOL_AFTER_FIRST_TRADE.add(1)
            )
        ).to.be.reverted;
      });

      it("should remove pre-tax SPC from the trader", async () => {
        const balanceBefore = await spaceCoin.balanceOf(bob.address);
        await router
          .connect(bob)
          .swapExactTokensForEth(
            SPC_OUT_FROM_TRADER,
            ETH_OUT_FROM_POOL_AFTER_FIRST_TRADE
          );
        const balanceAfter = await spaceCoin.balanceOf(bob.address);
        expect(balanceAfter.add(SPC_OUT_FROM_TRADER)).equal(balanceBefore);
      });

      it("should add the ETH to the trader's balance", async () => {
        const balanceBefore = await ethers.provider.getBalance(bob.address);
        const receipt = await (
          await router
            .connect(bob)
            .swapExactTokensForEth(
              SPC_OUT_FROM_TRADER,
              ETH_OUT_FROM_POOL_AFTER_FIRST_TRADE
            )
        ).wait();
        const gasCost = await helper.getGasCost(receipt);
        const balanceAfter = await ethers.provider.getBalance(bob.address);
        expect(
          balanceAfter.sub(ETH_OUT_FROM_POOL_AFTER_FIRST_TRADE).add(gasCost)
        ).equal(balanceBefore);
      });

      it("should add the post-tax SPC to the pool's balance", async () => {
        const balanceBefore = await spaceCoin.balanceOf(liquidityPool.address);
        await router
          .connect(bob)
          .swapExactTokensForEth(
            SPC_OUT_FROM_TRADER,
            ETH_OUT_FROM_POOL_AFTER_FIRST_TRADE
          );
        const balanceAfter = await spaceCoin.balanceOf(liquidityPool.address);
        expect(balanceBefore.add(SPC_RECEIVED)).equal(balanceAfter);
      });
    });
    describe.skip("without tax", () => {
      it("should fail", async () => {
        expect(true).to.be.false;
      });
    });
  });

  describe("Adding liquidity", async () => {
    let investors: SignerWithAddress[];
    let spaceCoin: SpaceCoin;
    let router: Router;
    let liquidityPool: LiquidityPool;

    const INVESTMENT = ONE_ETHER.mul(20_000);

    beforeEach(async () => {
      investors = [bob, charlie, dan];
      spaceCoin = await helper.createFreshProject();
      await helper.partiallyFundProject({
        spaceCoin,
        totalInvestment: INVESTMENT,
        investors,
      });
      const lpContracts = await helper.deployLPContracts({ spaceCoin });
      router = lpContracts.router;
      liquidityPool = lpContracts.liquidityPool;
    });

    describe("without tax", () => {
      it("should decrease both the ETH and SPC balances of the provider", async () => {
        const ETH_IN = ONE_ETHER.mul(4_000);
        const SPC_IN = ONE_ETHER.mul(20_000);
        const balanceBefore = await helper.getBalances({
          spaceCoin,
          address: treasury.address,
          liquidityPool,
        });
        const receipt1 = await (
          await spaceCoin
            .connect(treasury)
            .approve(liquidityPool.address, SPC_IN)
        ).wait();
        const receipt2 = await (
          await router.connect(treasury).addLiquidity(SPC_IN, 1, {
            value: ETH_IN,
          })
        ).wait();
        const gasCost1 = await helper.getGasCost(receipt1);
        const gasCost2 = await helper.getGasCost(receipt2);
        const balanceAfter = await helper.getBalances({
          spaceCoin,
          address: treasury.address,
          liquidityPool,
        });
        expect(balanceBefore.spaceCoin.sub(balanceAfter.spaceCoin)).to.equal(
          SPC_IN
        );
        expect(
          balanceBefore.eth.sub(balanceAfter.eth).sub(gasCost1).sub(gasCost2)
        ).to.be.equal(ETH_IN);
      });

      it("should refund the dust on followup mints", async () => {
        const ETH_IN_FIRST = ONE_ETHER.mul(1_000);
        const SPC_IN_FIRST = ONE_ETHER.mul(5_000);
        const ETH_IN_SECOND = ONE_ETHER.mul(1_000);
        const SPC_IN_SECOND = ONE_ETHER.mul(1_000);

        await spaceCoin
          .connect(treasury)
          .approve(liquidityPool.address, SPC_IN_FIRST.add(SPC_IN_SECOND));
        await router.connect(treasury).addLiquidity(SPC_IN_FIRST, 1, {
          value: ETH_IN_FIRST,
        });

        const balanceBefore = await helper.getBalances({
          spaceCoin,
          address: treasury.address,
          liquidityPool,
        });

        const receipt = await (
          await router.connect(treasury).addLiquidity(SPC_IN_SECOND, 1, {
            value: ETH_IN_SECOND,
          })
        ).wait();

        const gasCost = await helper.getGasCost(receipt);

        const balanceAfter = await helper.getBalances({
          spaceCoin,
          address: treasury.address,
          liquidityPool,
        });

        // at this point, the price ratio should have been 1:5
        // but the second addLiquidity gave 1000 : 1000.
        // Since 200 ETH is enough to cover 1000 SPC, 800 ETH should be refunded

        expect(balanceBefore.eth.sub(balanceAfter.eth)).to.equal(
          ONE_ETHER.mul(200).add(gasCost)
        );
      });

      it("should revert if given ETH is below the matching SPC", async () => {
        const ETH_IN_FIRST = ONE_ETHER;
        const SPC_IN_FIRST = ONE_ETHER.mul(5);
        const ETH_IN_SECOND = ONE_ETHER;
        const SPC_IN_SECOND = ONE_ETHER.mul(6);

        await spaceCoin
          .connect(treasury)
          .approve(liquidityPool.address, SPC_IN_FIRST.add(SPC_IN_SECOND));
        await router.connect(treasury).addLiquidity(SPC_IN_FIRST, 1, {
          value: ETH_IN_FIRST,
        });
        await expect(
          router.connect(treasury).addLiquidity(SPC_IN_SECOND, 1, {
            value: ETH_IN_SECOND,
          })
        ).to.be.revertedWith("non-matching eth value");
      });

      it("should increase both the ETH and SPC balances of the LP contract", async () => {
        const ETH_IN = ONE_ETHER.mul(4_000);
        const SPC_IN = ONE_ETHER.mul(20_000);
        const balanceBefore = await helper.getBalances({
          spaceCoin,
          address: liquidityPool.address,
          liquidityPool,
        });
        await spaceCoin
          .connect(treasury)
          .approve(liquidityPool.address, SPC_IN);
        await router.connect(treasury).addLiquidity(SPC_IN, 1, {
          value: ETH_IN,
        });

        const balanceAfter = await helper.getBalances({
          spaceCoin,
          address: liquidityPool.address,
          liquidityPool,
        });
        expect(balanceAfter.spaceCoin.sub(balanceBefore.spaceCoin)).to.equal(
          SPC_IN
        );
        expect(balanceAfter.eth.sub(balanceBefore.eth)).to.be.equal(ETH_IN);
      });

      it("should take a minimum liquidity cut on the first mint", async () => {
        const ETH_IN = ONE_ETHER.mul(4_000);
        const SPC_IN = ONE_ETHER.mul(20_000);

        await spaceCoin
          .connect(treasury)
          .approve(liquidityPool.address, SPC_IN);

        await router.connect(treasury).addLiquidity(SPC_IN, 1, {
          value: ETH_IN,
        });

        const treasuryBalance = await helper.getBalances({
          spaceCoin,
          address: treasury.address,
          liquidityPool,
        });

        expect(treasuryBalance.lp).to.equal(
          sqrt(SPC_IN.mul(ETH_IN)).sub(MIN_LIQUIDITY)
        );

        const minLiqAddress = "0x0000000000000000000000000000000000000001";

        const minLiqBalance = await liquidityPool.balanceOf(minLiqAddress);

        expect(minLiqBalance).to.equal(MIN_LIQUIDITY);
      });

      it("should revert if first liquidity added gives below min tokens", async () => {
        const ETH_IN = 1;
        const SPC_IN = 999_999;

        await spaceCoin
          .connect(treasury)
          .approve(liquidityPool.address, SPC_IN);

        await expect(
          router.connect(treasury).addLiquidity(SPC_IN, 1, {
            value: ETH_IN,
          })
        ).to.be.reverted;
      });

      it("should NOT take a minimum liquidity cut on the following mints", async () => {
        const ETH_IN = ONE_ETHER;
        const SPC_IN = ONE_ETHER;
        await spaceCoin.connect(treasury).transfer(bob.address, ONE_ETHER);
        await spaceCoin
          .connect(treasury)
          .approve(liquidityPool.address, SPC_IN);
        await spaceCoin.connect(bob).approve(liquidityPool.address, SPC_IN);
        await router.connect(treasury).addLiquidity(SPC_IN, 1, {
          value: ETH_IN,
        });
        await router.connect(bob).addLiquidity(SPC_IN, 1, {
          value: ETH_IN,
        });
        const balance = await helper.getBalances({
          liquidityPool,
          spaceCoin,
          address: bob.address,
        });
        expect(balance.lp).to.equal(sqrt(ONE_ETHER.mul(ONE_ETHER)));
      });

      it("should pass if the increase in the LP balance of the provider is less equal to the minimum", async () => {
        const ETH_IN = ONE_ETHER;
        const SPC_IN = ONE_ETHER;
        const BARELY_ENOUGH = sqrt(ETH_IN.mul(SPC_IN)).sub(MIN_LIQUIDITY);
        await spaceCoin
          .connect(treasury)
          .approve(liquidityPool.address, SPC_IN);
        await expect(
          router.connect(treasury).addLiquidity(SPC_IN, BARELY_ENOUGH, {
            value: ETH_IN,
          })
        ).to.not.be.reverted;
      });

      it("should revert if the increase in the LP balance of the provider is less than the minimum", async () => {
        const ETH_IN = ONE_ETHER;
        const SPC_IN = ONE_ETHER;
        const ALMOST = sqrt(ETH_IN.mul(SPC_IN)).sub(MIN_LIQUIDITY).add(1);
        await spaceCoin
          .connect(treasury)
          .approve(liquidityPool.address, SPC_IN);
        await expect(
          router.connect(treasury).addLiquidity(SPC_IN, ALMOST, {
            value: ETH_IN,
          })
        ).to.be.revertedWith("below min");
      });

      it("should emit a Mint event on a successful addLiquidiy call", async () => {
        const ETH_IN = ONE_ETHER;
        const SPC_IN = ONE_ETHER;
        const BARELY_ENOUGH = sqrt(ETH_IN.mul(SPC_IN)).sub(MIN_LIQUIDITY);
        await spaceCoin
          .connect(treasury)
          .approve(liquidityPool.address, SPC_IN);
        await expect(
          router.connect(treasury).addLiquidity(SPC_IN, BARELY_ENOUGH, {
            value: ETH_IN,
          })
        )
          .to.emit(liquidityPool, "Mint")
          .withArgs(treasury.address, ETH_IN, SPC_IN, BARELY_ENOUGH);
      });
    });

    describe.skip("with tax", () => {
      it("should fail", async () => {
        expect(true).to.be.false;
      });
    });

    describe("Removing liquidity", async () => {
      let spaceCoin: SpaceCoin;
      let router: Router;
      let liquidityPool: LiquidityPool;
      let provider: SignerWithAddress;
      let traders: SignerWithAddress[];

      const INITIAL_SPC = ONE_ETHER.mul(50);
      const INITIAL_ETH = ONE_ETHER.mul(10);

      beforeEach(async () => {
        const INITIAL_TRADER_SPC_BALANCE = ONE_ETHER.mul(2);
        provider = alice;
        traders = [bob, charlie, dan];
        const contracts = await helper.createLPWithInitialLiquidity({
          spcIn: INITIAL_SPC,
          ethIn: INITIAL_ETH,
          provider,
        });
        spaceCoin = contracts.spaceCoin;
        router = contracts.router;
        liquidityPool = contracts.liquidityPool;
        for (const trader of traders) {
          await spaceCoin
            .connect(treasury)
            .transfer(trader.address, INITIAL_TRADER_SPC_BALANCE);
          await spaceCoin
            .connect(trader)
            .approve(liquidityPool.address, INITIAL_TRADER_SPC_BALANCE);
        }
      });
      describe("with tax", () => {
        beforeEach(async () => {
          await spaceCoin.connect(alice).toggleTax(true);
        });

        describe("before trades", () => {
          /**
           * total supply = sqrt(50 * 10^18 * 10 * 10^18)
           * = 22360679774997896964
           */

          const TOTAL_SUPPLY = BigNumber.from("22360679774997896964");
          /**
           * provider's tokens = sqrt(50 * 10^18 * 10 * 10^18) - MIN_LIQ
           * = 22360679774997895964
           */

          const INITIAL_PROVIDER_TOKENS = BigNumber.from(
            "22360679774997895964"
          );

          /**
           * Eth out if all tokens are burned:
           *
           * (INITIAL_PROVIDER_TOKENS / TOTAL_SUPPLY) * INITIAL_ETH
           * = 9999999999999999552.7864045000420607163305325074895058237451
           *
           * rounded = 9999999999999999553
           */

          const ETH_OUT = BigNumber.from("9999999999999999552");

          /**
           * SPC out if all tokens are burned:
           *
           * (INITIAL_PROVIDER_TOKENS / TOTAL_SUPPLY) * INITIAL_SPC
           * = 49999999999999997763.9320225002103035816526625374475291187256
           *
           * rounded = 49999999999999997763
           */

          const SPC_OUT = BigNumber.from("49999999999999997763");

          /**
           * SPC received post tax = SPC_OUT * 0.98 = 48999999999999997808.6533820502060975100196092866985785363511
           *
           * rounded = 48999999999999997808
           */

          const SPC_RECEIVED = BigNumber.from("48999999999999997808");

          it("should emit a Burn event after successfully removing liquidity", async () => {
            const balancesBefore = await helper.getBalances({
              spaceCoin,
              liquidityPool,
              address: provider.address,
            });
            await expect(
              router.connect(provider).removeLiquidity(balancesBefore.lp, 1, 1)
            )
              .to.emit(liquidityPool, "Burn")
              .withArgs(
                provider.address,
                ETH_OUT,
                SPC_RECEIVED,
                INITIAL_PROVIDER_TOKENS
              );
          });

          it("should have non-zero reserves after all liquidity is removed", async () => {
            const providerBalance = await helper.getBalances({
              spaceCoin,
              liquidityPool,
              address: provider.address,
            });

            await router
              .connect(provider)
              .removeLiquidity(providerBalance.lp, 1, 1);

            const poolBalance = await helper.getBalances({
              spaceCoin,
              liquidityPool,
              address: liquidityPool.address,
            });

            expect(poolBalance.eth).to.be.gt(0);
            expect(poolBalance.spaceCoin).to.be.gt(0);
          });

          it("should remove the eth and spc from pool reserves", async () => {
            const providerBalance = await helper.getBalances({
              spaceCoin,
              liquidityPool,
              address: provider.address,
            });

            const poolBalanceBefore = await helper.getBalances({
              spaceCoin,
              liquidityPool,
              address: liquidityPool.address,
            });

            await router
              .connect(provider)
              .removeLiquidity(providerBalance.lp, 1, 1);

            const poolBalanceAfter = await helper.getBalances({
              spaceCoin,
              liquidityPool,
              address: liquidityPool.address,
            });

            expect(poolBalanceAfter.eth.add(ETH_OUT)).to.equal(
              poolBalanceBefore.eth
            );
            expect(poolBalanceAfter.spaceCoin.add(SPC_OUT)).to.equal(
              poolBalanceBefore.spaceCoin
            );
          });

          it("should add the eth and spc to the provider's balance", async () => {
            const providerBalanceBefore = await helper.getBalances({
              spaceCoin,
              liquidityPool,
              address: provider.address,
            });

            const receipt = await (
              await router
                .connect(provider)
                .removeLiquidity(providerBalanceBefore.lp, 1, 1)
            ).wait();

            const gasCost = await helper.getGasCost(receipt);

            const providerBalanceAfter = await helper.getBalances({
              spaceCoin,
              liquidityPool,
              address: provider.address,
            });

            expect(providerBalanceBefore.eth.add(ETH_OUT)).to.equal(
              providerBalanceAfter.eth.add(gasCost)
            );
            expect(providerBalanceBefore.spaceCoin.add(SPC_RECEIVED)).to.equal(
              providerBalanceAfter.spaceCoin
            );
          });
        });
        describe.skip("after trades", () => {
          it("should fail", async () => {
            expect(true).to.be.false;
          });
        });
      });
      describe.skip("without tax", () => {
        it("should fail", async () => {
          expect(true).to.be.false;
        });
      });

      describe("edge cases", () => {
        it("should not let reserves get to 0", async () => {
          const INITIAL_SPC = BigNumber.from("1");
          const INITIAL_ETH = BigNumber.from("100000000");
          // sqrt(1 * 100_000_000) = 10_000, which is greater than 1_000 (the min liquidity)
          const { liquidityPool, router, spaceCoin } =
            await helper.createLPWithInitialLiquidity({
              spcIn: INITIAL_SPC,
              ethIn: INITIAL_ETH,
            });

          const myLiquidityTokens = await liquidityPool
            .connect(treasury)
            .balanceOf(treasury.address);

          await expect(
            router.connect(treasury).removeLiquidity(myLiquidityTokens, 0, 0)
          ).to.be.revertedWith("zero trade");
        });
      });
    });
  });
});
