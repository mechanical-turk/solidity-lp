//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.14;

// import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./interfaces/ISpaceCoin.sol";

contract SpaceCoin is ERC20, ISpaceCoin {
    /**
     * @dev This is an enum that represents what phase the funraising is currently on.
     *
     * SEED:    This is the initial phase. Only whitelisted investors are allowed to buy the token.
     *          The collective maximum total investment is 15_000 ETH in this stage.
     *          Each address is allowed a personal maximum of 1_500 ETH in this stage.
     *
     * GENERAL: This is the second phase. Whitelisted or not, all addresses are allowed to buy the token.
     *          The collective maximum total investment is 30_000 ETH in this stage.
     *          Each address is allowed a personal maximum of 1_000 ETH in this stage.
     *
     * OPEN:    This is the third and final phase.
     *          The collective maximum total investment is still limited by 30_000 ETH.
     *          Personal maximum limits are also released.
     */
    enum Phase {
        SEED,
        GENERAL,
        OPEN
    }

    /**
     * @dev Flag used for pausing / unpausing fundraising. When paused, no fundraising is allowed.
     * Otherwise, normal fundraising rules apply.
     *
     * Inits to false by default.
     */
    bool public isPaused;

    /**
     * @dev Flag used for enabling / disabling tax. When enabled, all token trades will be
     * subject to a 2% tax.
     *
     * Inits to false by default.
     */
    bool public isTaxed;

    /**
     * @dev Accounting variable used to track the total investments so far, so that
     * we can compute whether the current fundraising phase is oversubscribed.
     *
     * Inits to 0 by default.
     */
    uint256 public investedSupply;

    /**
     * @dev Variable that tracks the current fundraising phase.
     *
     * Inits to Phase.SEED by default.
     */
    Phase public currentPhase;

    /**
     * @dev This is the owner of the contract. It's initialized on the constructor and it's immutable
     * throughout the lifecylce of the contract. It grants special privileges to the deployer, such
     * as whitelisting investors, pausing/unpausing fundraising, enabling/disabling tax, and advancing
     * the fundraising phase.
     */
    address public immutable owner;

    /**
     * @dev Special immutable address initiailzed on the constructor where collected tax gets stored.
     */
    address public immutable treasury;

    /**
     * @dev Accounting value used to compute how much a given address has invested so far. Each
     * successful investment increments the sender's slot in units of SpaceCoin tokens. Each
     * claimToken() call will decrement the same slot.
     */
    mapping(address => uint256) public invested;

    /**
     * @dev Used to determine whether a sender is whitelisted, and therefore
     * allowed to invest on the seed round.
     */
    mapping(address => bool) public whitelisted;

    /**
     * @dev The maximum number of tokens we want to mint.
     */
    uint256 public constant TARGET_SUPPLY = 500_000 ether;

    /**
     * @dev Helper constant we use when the limits are released.
     */
    uint256 private constant MAX_INT =
        0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

    /**
     * @dev Exchange rate in terms of how many spacecoins 1 ETH can buy
     */
    uint256 public constant EXCHANGE_RATE = 5;

    /**
     * @dev The maximum number of spacecoins that can be personally bought
     * during the seed phase.
     */
    uint256 public constant SEED_PERSONAL_LIMIT = 1_500 ether * EXCHANGE_RATE;

    /**
     * @dev The maximum total number of spacecoins that can be bought
     * during the seed phase.
     */
    uint256 public constant SEED_TOTAL_LIMIT = 15_000 ether * EXCHANGE_RATE;

    /**
     * @dev The maximum number of spacecoins that can be personally bought
     * during the general phase.
     */
    uint256 public constant GENERAL_PERSONAL_LIMIT =
        1_000 ether * EXCHANGE_RATE;

    /**
     * @dev The maximum total number of spacecoins that can be bought
     * during the general phase.
     */
    uint256 public constant GENERAL_TOTAL_LIMIT = 30_000 ether * EXCHANGE_RATE;

    /**
     * @dev Since the tax rate is 2%, we effectively divide the pre-tax
     * amount by 50 to calculate the tax amount.
     */
    uint8 public constant TAX_DIVISOR = 50;

    constructor(address _treasury) ERC20("SpaceCoin", "SPC") {
        owner = msg.sender;
        treasury = _treasury;

        _mint(treasury, TARGET_SUPPLY - GENERAL_TOTAL_LIMIT);
    }

    /**
     * @dev This function is used as the only legal way to buy tokens.
     *
     * 1) If funraising is paused, investments are blocked.
     * 2) You need to send a non-zero amount of ETH.
     * 3) If the current phase is seed and you aren't whitelisted, you'll be blocked.
     * 4) If you go above the total phase limit, you'll be blocked.
     * 5) If you go above the personal phase limit, you'll be blocked.
     *
     */
    function invest() external payable {
        require(!isPaused, "paused");
        require(msg.value > 0, "investing 0");
        require(
            whitelisted[msg.sender] || (currentPhase != Phase.SEED),
            "whitelist only"
        );
        uint256 minting = msg.value * EXCHANGE_RATE;

        uint256 totalLimit = (currentPhase == Phase.SEED)
            ? SEED_TOTAL_LIMIT
            : GENERAL_TOTAL_LIMIT;
        investedSupply += minting;
        require(investedSupply <= totalLimit, "above total limit");

        uint256 personalLimit = (currentPhase == Phase.SEED)
            ? SEED_PERSONAL_LIMIT
            : (currentPhase == Phase.GENERAL)
            ? GENERAL_PERSONAL_LIMIT
            : MAX_INT;

        invested[msg.sender] += minting;
        require(invested[msg.sender] <= personalLimit, "above personal limit");

        if (invested[msg.sender] == personalLimit) {
            emit ReachedPersonalLimit(currentPhase, msg.sender);
        }
        if (investedSupply == totalLimit) {
            emit ReachedTotalPhaseLimit(currentPhase, msg.sender);
        }
        emit Investment(msg.sender, msg.value);
    }

    function withdraw() external ownerOnly {
        uint256 ethBalance = address(this).balance;
        (bool success, ) = treasury.call{value: ethBalance}("");
        require(success, "eth send failed");
        emit Withdrawal(ethBalance);
    }

    /**
     * @dev Helper modifier used for limiting certain functions to the contract owner only.
     */
    modifier ownerOnly() {
        require(msg.sender == owner, "owner only");
        _;
    }

    /**
     * @dev Used for advancing the phase by 1 stage from current phase.
     */
    function advancePhaseFrom(Phase from) external ownerOnly {
        require(from == currentPhase, "from not current");
        require(currentPhase != Phase.OPEN, "advanced open");
        currentPhase = Phase(uint256(currentPhase) + 1);
        emit AdvancedPhase(currentPhase);
    }

    /**
     * @dev Used for whitelisting investors so they can invest during seed phase.
     */
    function addToWhitelist(address investor) external ownerOnly {
        whitelisted[investor] = true;
        emit AddedToWhitelist(investor);
    }

    /**
     * @dev Used for pausing and resuming the fundraising.
     */
    function togglePaused(bool to) external ownerOnly {
        isPaused = to;
        emit ToggledFundraisePause(isPaused);
    }

    /**
     * @dev Used for toggling tax on and off.
     */
    function toggleTax(bool to) external ownerOnly {
        isTaxed = to;
        emit ToggledTax(isTaxed);
    }

    /**
     * @dev Internal helper method used to calculate how much a tax to apply on transfers.
     */
    function applyTax(uint256 amount)
        internal
        view
        returns (uint256 taxAmount, uint256 remainder)
    {
        taxAmount = isTaxed ? amount / TAX_DIVISOR : 0;
        remainder = amount - taxAmount;
    }

    /**
     * @dev Used by investors to claim their tokens after phase: Open
     */
    function claimTokens(uint256 amount, address to) external {
        require(currentPhase == Phase.OPEN, "wrong phase");
        require(amount <= invested[msg.sender], "insufficient investment");
        invested[msg.sender] -= amount;
        _mint(to, amount);
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        (uint256 taxAmount, uint256 remainder) = applyTax(amount);
        if (taxAmount > 0) {
            super._transfer(from, treasury, taxAmount);
        }
        return super._transfer(from, to, remainder);
    }

    /**
     * @dev Emitted when a sender reaches their personal phase limit.
     */
    event ReachedPersonalLimit(Phase phase, address indexed by);

    /**
     * @dev Emitted when a sender reaches the total phase limit.
     */
    event ReachedTotalPhaseLimit(Phase indexed phase, address by);

    /**
     * @dev Emitted when the owner pauses or resumes the fundraising.
     */
    event ToggledFundraisePause(bool to);

    /**
     * @dev Emitted when an address is whitelisted.
     */
    event AddedToWhitelist(address indexed investor);

    /**
     * @dev Emitted when the owner advances the fundraising phase.
     */
    event AdvancedPhase(Phase indexed to);

    /**
     * @dev Emitted when an address invests successfully.
     */
    event Investment(address indexed investor, uint256 amount);

    /**
     * @dev Emitted when the owner toggles the tax on or off.
     */
    event ToggledTax(bool to);

    event Withdrawal(uint256 total);
}
