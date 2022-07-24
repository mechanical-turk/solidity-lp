# Liquidity Pool

## Disclaimer

⚠️⚠️ This contract is not audited. Using it on production is strongly advised against. ⚠️⚠️

## Description

This is a Uniswap-like liquidity pool implementation. It's a learning exercise and thus has a much more reduced scope. For example, it only supports one pair of assets: SPC (a tax-on-trade token) and ETH. You will also see my attempt at consolidating the main learnings from the Spartan Hack and the ingenuous approach of the Uniswap protocol into my personal approach at how a liquidity pool should work.

## Instructions

- Run `npm install` to install all dependencies.
- Run `npx hardhat test` to run the test suite.

## Starting the frontend

- From within the `lp/frontend` directory, run `npm start`.
- Go to `http://localhost:1234` on your browser
- Before logging in, make sure you select the Rinkeby network on Metamask.
- Click the login button and pick an account that ideally has some Rinkeby ETH.
- Transactions will take time. We await the trx receipts too. So don't leave the browser until you get a success or error alert.
- NOTE: To see the testnet transactions that deployed the contracts, go to: https://rinkeby.etherscan.io/address/0x5b9af6a36823287905df05b4055284490058b417

## Design Decisions

1. **BalanceOf is the root of all evil**: What Uniswap's design and Spartan hack shows again and again, is that depending on `address(this).balance` and `x.balanceOf` is dangerous. Uniswap has a sync mechanism that synchronizes the internal reserves of the contract to the external ERC-20 balances. Spartan forgot to do it properly and got hacked. In my system, I just didn't want to do it at all. I never fallback to `balanceOf` when calculating my reserves. When I'm doing payouts, swaps, mints etc, I never use balanceOf in lieu of my reserves. What I do instead is taking deltas. Whenever there's an ERC20 transfer / transferFrom, I calculate how much the balance has moved. Again, I never look at the balance itself as a source of truth for the reserves. I directly call transfer & transferFrom functions myself, and I calculate how much the target balance has moved in the process. Then I use that delta to readjust my reserves. This means that ETH or SPC sent indirectly into my liquidity pool are completely ignored. They are also irrecoverable. But that's the sender's problem, not the pool's.
2. **Thin router**: When I attempted to separate the state from the logic a la router, I saw that I was introducing potential vulnerabilities. I'm aware that those vulnerabilities could be overcome. But in my particular implementation, I could not develop the confidence that it would work. As a result, I opted to keep the router as thin as possible. It's basically a min-checker at this point.
3. **Min is good, desired is bad:**: I wanted to build the absolute bare minimum to decrease my chances of making a mistake. For this reason, my trades and liquidity functions don't deal with a `desired` amount. They do take `min` arguments. I take everything you give me, and I give you the maximum your given asset can afford. And I make sure that what I give you is above your `min`. This is why my trades don't have dust / refunds since they don't concern themselves with `desired` amounts. tl;dr: You give me all you can spare, fully knowing that none of it will come back. And I give back all that it can afford, as long as it's above your `min`.
4. **SPC First**: Due to tax, I think of SPC as the "problem child", and thus I always choose to deal with it first. I get it out of the way, so I can focus on the core problem. As a result, ETH always comes second in my system. This has an interesting consequence on minting. Let's say the price ratio is 5 SPC to 1 ETH. If you want to add liquidity with 50 SPC, you have to send 10 ETH. However, a trx that changes the price ratio can be indexed before yours. No matter in what direction the price moves, I still take care of SPC first. If the price ratio becomes 10 SPC to 1 ETH, of the 50 SPC and 10 ETH you just sent, I will take all of the SPC (since it's the problem child and needs to be dealt with first), and about 5ETH of the 10ETH, thus refunding you 5 ETH back. And if the price moves in the other direction where 5 SPC is now worth 2 ETH, I will still take all of the 50 SPC you just sent, and then see that the 10ETH you sent isn't enough to cover the 20 ETH equivalent of 50 SPC. And thus I revert. In order to prevent this from happening, just like sending a bit more gas than necessary, I encourage the user to send about 5% more ETH than the current state demands. If you check my frontend code, you can see that I have a hidden coefficient in the Add Liquidity experience where I take a bit more ETH than what the function needs, but end up refunding all of the excess anyway.
5. **Bottomline > Slippage**: I wanted to be as user-friendly as possible and tried to respect the real intentions of the users. In my opinion, the trader cares a lot more about how much their balance moves and in what direction, than they care about what the price change due to slippage is. This is why I use post-tax deltas when determining if the trade was above their min. Because that's how I treat the pool itself. When a trader sends SPC in to swap or to mint, I don't care about how much they paid. I only care about how much actually entered the pool (post-tax). It's only fair to treat the trader and the liquidity provider the same way when they swap SPC out or remove liquidity.
6. **Assertions:** I added 3 `assert` statements that checked whether the new invariant (or the constant) is greater than the previous one. Once in mint, once in SPC=>ETH swap, and once again in ETH=>SPC swap. I have no reason to believe that these are actually necessary, and I do trust my math. However, I think it's a good idea to be a bit more paranoid than usual in this particular project. These 3 assertions are my last line of defense.


## Design Discussions

## Question

How would you extend your LP contract to award additional rewards – say, a separate ERC-20 token – to further incentivize liquidity providers to deposit into your pool?

## Answer

This ended up turning into an essay. My tl;dr: Give the liquidity providers Reward tokens proportional to their added liquidity. As long as they have their original liquidity in, these Reward tokens act as options to participate in the seed phase of an upcoming ICO. Here's the long version:

We could reward the liquidity providers with a separate token - say Reward Tokens - on deposit. We could leave it at that but the informed liquidity provider would not be truly incentivized by such a scheme. The token has to carry some kind of utility or meaning beyond being a "participation badge". On the other hand, we don't want the reward token to carry an incentive that undermines the original structure: Traders want minimum slippage, which comes from maximum liquidity volume, which comes from liquidity added by the providers, who do so for the fees traders generate. If the reward system introduces an orthogonal incentive to the structure above, the system may suffer or collapse.

Here's an example of a bad system: "On deposit, we give you Reward Tokens tokens that are proportional to the LP tokens you just minted. You can then use these Reward Tokens to enter a raffle that is totally not vulnerable against pseudo-random number generator attacks!" This is bad, because the liquidity provider is no longer purely incentivized to increase volume. They are also incentivized to deposit - which are related but not entirely the same thing. Meaning, they can add liquidity, get Reward tokens, remove liquidity, add liquidity again, get Reward tokens, ad infinitum. Here's a naive countermeasure: We can burn proportional Reward tokens whenever they remove liquidity. So the only time they can enter the #legit raffle is while they are still providing volume. This is better, but still naive. Because they can use the Reward tokens to enter the raffle, remove liquidity, add liquidity back again, get Reward tokens and then we're back to square 1.

We could timelock their rewards such that they would have to let their added liquidity stay untouched for an extended period of time in order to obtain the rights to mint the Reward tokens. Say, for 1 month. We have 2 phases: Rewards + Redemption. You can't redeem during the Reward phase, but you can earn the Reward tokens. And you can't earn more Reward tokens during the Redemption phase, but you can at least redeem them. This is a countermeasure against doing add/remove liquidity roundtrips to print infinite Reward tokens. This is a very good thing for the pool, because it increases the stability and the long term maximum volume. Still though, we have one more very important problem: Where's the actual reward coming from?

Perhaps I can fund the rewards program with my own cash. But as the volume grows, so should the rewards. This is not sustainable. I, as the liquidity pool architect and manager need to have some kind of income to sustain this reward program. Unless I'm rewarding the providers out of the kindness of my heart, that reward should come from the pool itself. This means that i'd be taking a team fee cut. But at that point, I'd be taking money off the table, to the detriment of the liquidity providers. And I'm doing this to incentivize them? The informed provider would not be swayed by "rewards" that are funded by skimming their profits. So here's the main takeaway: Don't offer short term cash-like rewards, because either you need to pay for them yourself (which is unsustainable), or the pool does (which defeats the purpose). So what are we left with?

Here's one potential solution I can offer: The Reward token is a unit of option to participate in the seed round of an upcoming ICO. If the provider chooses to participate, they will have an opportunity to buy cheaper than everyone else. And the whitelisting isn't random: you get to invest with fellow investors who have utilized their assets in a similar fashion as you have. You have both participated in the same LP. And that's better than nothing. But let's say you don't like the investment opportunity. That's fine too. It was just an option, and you don't need to exercise.

This way, the liquidity provider is further incentivized to add liquidity, and actually hold that liquidity in until the ICO happens, because we'll burn the Reward (a.k.a option) tokens if they remove liquidity. This is great, because they are further incentivized to fulfil their purpose in the system: to maximize the liquidity. They also get proportionally rewarded with no additional cost to anyone involved. And even if they don't end up exercising their options, they have lost nothing. All their fees have been paid in full.

There are a few reasons I like this system even though it's far from perfect:

A) It's an actual incentive.
B) I don't need to pay for it.
C) My providers don't need to pay for it either.
D) It's not orthogonal to the existing incentive structure.
E) It enhances the existing incentive structure by encouraging the liquidity providers to keep their liquidity in the pool longer.


