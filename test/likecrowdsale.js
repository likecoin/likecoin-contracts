/* eslint-env mocha, node */
/* global artifacts, contract, assert, web3 */

const utils = require("./utils.js");
const coinsToCoinUnits = utils.coinsToCoinUnits;
const BigNumber = require("bignumber.js");
const LikeCoin = artifacts.require("./LikeCoin.sol");
const LikeCrowdsale = artifacts.require("./LikeCrowdsale.sol");

const hardCap = coinsToCoinUnits(1000000000);
const referrerBonusPercent = 5;
const coinsPerEth = 25000;
const crowdsaleLength = 60 * 60 * 24 * 7;

contract("LikeCoin Crowdsale 1", (accounts) => {
    const privateFunds = {
        5: coinsToCoinUnits(10000000),
        6: coinsToCoinUnits(12000000)
    };

    const buyCoins = {
        1: coinsToCoinUnits(25000),
        2: coinsToCoinUnits(8000000),
        3: coinsToCoinUnits(7000000),
        4: coinsToCoinUnits(62975000)
    };

    const buyWeis = {
        1: buyCoins[1].div(coinsPerEth),
        2: buyCoins[2].div(coinsPerEth),
        3: buyCoins[3].div(coinsPerEth),
        4: buyCoins[4].div(coinsPerEth)
    };

    let unlockTime;
    let start;
    let end;
    let like;
    let crowdsale;

    before(async () => {
        // The blocktime of next block could be affected by snapshot and revert, so mine the next block immediately by
        // calling testrpcIncreaseTime
        await utils.testrpcIncreaseTime(1);
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        start = now + 1000;
        end = start + crowdsaleLength;
        unlockTime = end + 10000;
        like = await LikeCoin.new(0, 0);
        crowdsale = await LikeCrowdsale.new(like.address, start, end, coinsPerEth, hardCap, referrerBonusPercent);
    });

    it("should deploy the crowdsale contract correctly", async () => {
        assert.equal(await crowdsale.owner(), accounts[0], `LikeCrowdsale contract has wrong owner`);
        assert.equal(await crowdsale.start(), start, `LikeCrowdsale contract has wrong start`);
        assert.equal(await crowdsale.end(), end, `LikeCrowdsale contract has wrong end`);
        assert.equal((await crowdsale.coinsPerEth()).toNumber(), coinsPerEth, `LikeCrowdsale contract has wrong coinsPerEth`);
        assert((await crowdsale.hardCap()).eq(hardCap), `LikeCrowdsale contract has wrong hardCap`);
        assert((await crowdsale.referrerBonusPercent()).eq(referrerBonusPercent), `LikeCrowdsale contract has wrong referrerBonusPercent`);
        assert.equal(await crowdsale.privateFundFinalized(), false, `LikeCrowdsale contract has wrong privateFundFinalized`);
    });

    it("should forbid non-owner to register crowdsale contract", async () => {
        await utils.assertSolidityThrow(async () => {
            await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime, {from: accounts[1]});
        }, "should forbid accounts[1] to register crowdsale contract");
    });

    it(`should mint ${hardCap.toFixed()} units of coins`, async () => {
        await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
        const supply = await like.totalSupply();
        assert(supply.eq(hardCap), `${hardCap.toFixed()} units of coins should be minted`);
    });

    it(`should give the crowdsale contract ${hardCap.toFixed()} units of coins`, async () => {
        const balance = await like.balanceOf(crowdsale.address);
        assert(balance.eq(hardCap), `The crowdsale contract should own ${hardCap.toFixed()} units of coins`);
    });

    it("should forbid registering crowdsale contract again", async () => {
        await utils.assertSolidityThrow(async () => {
            await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
        }, "Can register crowdsale contract once only");
    });

    it("should add private fund correctly", async () => {
        const remaining1 = await like.balanceOf(crowdsale.address);
        await crowdsale.addPrivateFund(accounts[5], privateFunds[5].sub(100));
        const remaining2 = await like.balanceOf(crowdsale.address);
        const account5Coins = await like.balanceOf(accounts[5]);
        assert(remaining2.eq(remaining1.sub(privateFunds[5].sub(100))), "Wrong remaining coins after adding private fund");
        assert(account5Coins.eq(privateFunds[5].sub(100)), "Wrong amount of coins on accounts[5] after adding private fund (1st time)");
        await crowdsale.addPrivateFund(accounts[6], privateFunds[6]);
        const remaining3 = await like.balanceOf(crowdsale.address);
        const account6Coins = await like.balanceOf(accounts[6]);
        assert(remaining3.eq(remaining2.sub(privateFunds[6])), "Wrong remaining coins after adding private fund");
        assert(account6Coins.eq(privateFunds[6]), "Wrong amount of coins on accounts[6] after adding private fund");
        await crowdsale.addPrivateFund(accounts[5], 100);
        const remaining4 = await like.balanceOf(crowdsale.address);
        assert(remaining4.eq(remaining3.sub(100)), "Wrong remaining coins after adding private fund");
        assert((await like.balanceOf(accounts[5])).eq(privateFunds[5]), "Wrong amount of coins on accounts[5] after adding private fund (2nd time)");
    });

    it("should forbid adding private fund more than remaining coins", async () => {
        const remaining = await like.balanceOf(crowdsale.address);
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[7], remaining.add(1));
        }, "should forbid adding private fund more than remaining coins");
    });

    it("should forbid non-owner to add private fund", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[7], 100000, {from: accounts[1]});
        }, "should forbid adding private fund from accounts[1]");
    });

    it("should forbid non-owner to finalize private fund", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalizePrivateFund({from: accounts[1]});
        }, "should forbid finalizing private fund from accounts[1]");
    });

    it("should forbid adding private fund after finalizing private fund", async () => {
        const finalizeFlag1 = await crowdsale.privateFundFinalized();
        assert.equal(finalizeFlag1, false, "Finalize flag is already set before finalizing private fund, please adjust test case");
        await crowdsale.finalizePrivateFund();
        const finalizeFlag2 = await crowdsale.privateFundFinalized();
        assert.equal(finalizeFlag2, true, "Finalize flag should be not set");
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[7], 100000);
        }, "should forbid adding private fund after finalizing private fund");
    });

    it("should lock private fund until unlock time", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        assert.isBelow(now, unlockTime, "Blocktime is already after unlock time, please adjust test case");
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[7], 100, {from: accounts[5]});
        }, "should lock private fund until unlock time");
    });

    it("should forbid buying coins before crowdsale starts", async () => {
        await crowdsale.registerKYC([accounts[1]]);
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        assert.isBelow(now, start, "Blocktime is already after crowdsale start, please adjust test case");
        await utils.assertSolidityThrow(async() => {
            await web3.eth.sendTransaction({ from: accounts[1], to: crowdsale.address, value: buyWeis[1] });
        }, "Buying coins before crowdsale starts should be forbidden");
    });

    it("should forbid buying coins before KYC", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(start + 10 - now);
        await utils.assertSolidityThrow(async() => {
            await web3.eth.sendTransaction({ from: accounts[2], to: crowdsale.address, value: buyWeis[2] });
        }, "Buying coins before KYC should be forbidden");
    });

    it("should allow buying coins after KYC", async () => {
        const remaining1 = await like.balanceOf(crowdsale.address);
        await web3.eth.sendTransaction({ from: accounts[1], to: crowdsale.address, value: buyWeis[1] });
        const remaining2 = await like.balanceOf(crowdsale.address);
        assert(remaining1.sub(buyCoins[1]).eq(remaining2), "Wrong remaining coins after accounts[1] buying coins");
        const account1Coins = await like.balanceOf(accounts[1]);
        assert(account1Coins.eq(buyCoins[1]), "Wrong amount of coins given after accounts[1] buying coins");
        await crowdsale.registerKYC([accounts[2]]);
        await web3.eth.sendTransaction({ from: accounts[2], to: crowdsale.address, value: buyWeis[2] });
        const remaining3 = await like.balanceOf(crowdsale.address);
        assert(remaining2.sub(buyCoins[2]).eq(remaining3), "Wrong remaining coins after accounts[2] buying coins");
        const account2Coins = await like.balanceOf(accounts[2]);
        assert(account2Coins.eq(buyCoins[2]), "Wrong amount of coins given after accounts[2] buying coins");
    });

    it("should calculate bonus correctly", async () => {
        await crowdsale.registerKYC([accounts[3], accounts[4]]);
        const remaining1 = await like.balanceOf(crowdsale.address);
        await crowdsale.registerReferrer(accounts[3], accounts[7]);
        await web3.eth.sendTransaction({ from: accounts[3], to: crowdsale.address, value: buyWeis[3] });
        const remaining2 = await like.balanceOf(crowdsale.address);
        const account3Coins = await like.balanceOf(accounts[3]);
        assert(account3Coins.eq(buyCoins[3]), "Wrong amount of coins given after accounts[3] buying coins");
        const account7Coins = await like.balanceOf(accounts[7]);
        assert(account7Coins.eq(buyCoins[3].mul(referrerBonusPercent).div(100)), "Wrong amount of bonus coins given to accounts[7] after accounts[3] buying coins");
        assert(remaining2.eq(remaining1.sub(account3Coins).sub(account7Coins)),  "Wrong remaining coins after accounts[3] buying coins");

        const account1CoinsBefore = await like.balanceOf(accounts[1]);
        await crowdsale.registerReferrer(accounts[4], accounts[1]);
        await web3.eth.sendTransaction({ from: accounts[4], to: crowdsale.address, value: buyWeis[4] });
        const remaining3 = await like.balanceOf(crowdsale.address);
        const account4Coins = await like.balanceOf(accounts[4]);
        assert(account4Coins.eq(buyCoins[4]), "Wrong amount of coins given after accounts[4] buying coins");
        const account1CoinsAfter = await like.balanceOf(accounts[1]);
        assert(account1CoinsAfter.sub(account1CoinsBefore).eq(buyCoins[4].mul(referrerBonusPercent).div(100)), "Wrong amount of bonus coins given to accounts[1] after accounts[4] buying coins");
        assert(remaining3.eq(remaining2.sub(account4Coins).sub(account1CoinsAfter.sub(account1CoinsBefore))),  "Wrong remaining coins after accounts[4] buying coins");
    });

    it("should forbid setting another referrer", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.registerReferrer(accounts[3], accounts[8]);
        }, "accounts[3] already has referrer, re-register should be forbidden");
    });

    it("should forbid non-owner to set referrer", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.registerReferrer(accounts[1], accounts[9], {from: accounts[1]});
        }, "should forbid non-owner accounts[1] to set referrer");
    });

    it("should forbid buying 0 coins", async () => {
        await crowdsale.registerKYC([accounts[7]]);
        await utils.assertSolidityThrow(async () => {
            await web3.eth.sendTransaction({ from: accounts[7], to: crowdsale.address, value: 0 });
        }, "accounts[7] is buying 0 coins, which should be forbidden");
    });

    it("should forbid early finalization", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalize();
        }, "Calling finalize before crowdsale ends should be forbidden");
    });

    it("should forbid buying coins after crowdsale ends", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        if (now < end) {
            await utils.testrpcIncreaseTime(end + 10 - now);
        }
        await utils.assertSolidityThrow(async() => {
            await web3.eth.sendTransaction({ from: accounts[3], to: crowdsale.address, value: buyWeis[3] });
        }, "Buying coins after crowdsale ends should be forbidden");
    });

    it("should forbid non-owner to call finalize", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalize({from: accounts[1]});
        }, "Calling finalize from non-owner should be forbidden");
    });

    it("should send ether to owner after finalization", async () => {
        const ownerBalance1 = web3.eth.getBalance(accounts[0]);
        const contractBalance1 = web3.eth.getBalance(crowdsale.address);
        await crowdsale.finalize({gasPrice: 0});
        const ownerBalance2 = web3.eth.getBalance(accounts[0]);
        const contractBalance2 = web3.eth.getBalance(crowdsale.address);
        assert(ownerBalance2.eq(ownerBalance1.add(contractBalance1)), "Wrong owner balance after finalization");
        assert.equal(contractBalance2.toNumber(), 0, "Wrong contract balance after finalization");
        assert.equal((await like.balanceOf(crowdsale.address)).toNumber(), 0, "No coins should remain after finalization");
    });

    it("should forbid calling finalize more than once", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalize();
        }, "Calling finalize more than once should be forbidden");
    });

    it("should forbid registering another crowdsale contract", async () => {
        const anotherCrowdsale = await LikeCrowdsale.new(like.address, start, end, coinsPerEth, hardCap, referrerBonusPercent);
        await utils.assertSolidityThrow(async () => {
            await like.registerCrowdsales(anotherCrowdsale.address, hardCap, unlockTime);
        }, "Registering another crowdsale contract should be forbidden");
    });

    it("should handle locking of private funds properly", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        assert.isBelow(now, unlockTime, "Blocktime is already after unlock time, please adjust test case");
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[7], 100, {from: accounts[5]});
        }, "should lock private fund until unlock time");
        await utils.testrpcIncreaseTime(unlockTime + 10 - now);
        await like.transfer(accounts[7], 100, {from: accounts[5]});
    });
});

contract("LikeCoin Crowdsale 2", (accounts) => {
    const buyCoins = {
        1: coinsToCoinUnits(800000000),
        2: coinsToCoinUnits(200000000),
    };

    const buyWeis = {
        1: buyCoins[1].div(coinsPerEth),
        2: buyCoins[2].div(coinsPerEth),
    };

    const unlockTime = 0x7FFFFFFF;
    let start;
    let end;
    let like;
    let crowdsale;

    before(async () => {
        // The blocktime of next block could be affected by snapshot and revert, so mine the next block immediately by
        // calling testrpcIncreaseTime
        await utils.testrpcIncreaseTime(1);
        let now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        start = now + 1000;
        end = start + crowdsaleLength;
        like = await LikeCoin.new(0, 0);
        crowdsale = await LikeCrowdsale.new(like.address, start, end, coinsPerEth, hardCap, referrerBonusPercent);
        await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
        now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(start + 10 - now);
        await crowdsale.registerKYC([accounts[1], accounts[2]]);
        await web3.eth.sendTransaction({ from: accounts[1], to: crowdsale.address, value: buyWeis[1] });
    });

    it("should forbid adding private fund after crowdsale started", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[3], 10000000);
        }, "crowdsale has already started, adding private fund should be forbidden");
    });

    it("should forbid buying more coins than remaining", async () => {
        const remaining = await like.balanceOf(crowdsale.address);
        await utils.assertSolidityThrow(async () => {
            await web3.eth.sendTransaction({ from: accounts[3], to: crowdsale.address, value: remaining.div(coinsPerEth).add(1) });
        }, "Buying more coins than remaining should be forbidden");

        await crowdsale.registerReferrer(accounts[3], accounts[1]);
        const toBuy = remaining.mul(100).div(100 + referrerBonusPercent);
        await utils.assertSolidityThrow(async () => {
            await web3.eth.sendTransaction({ from: accounts[3], to: crowdsale.address, value: toBuy.div(coinsPerEth).add(1).floor() });
        }, "Buying more coins (bonus included) than remaining should be forbidden");
    });

    it("should allow buying exactly all remaining coins", async () => {
        await web3.eth.sendTransaction({ from: accounts[2], to: crowdsale.address, value: buyWeis[2] });
        assert.equal((await like.balanceOf(crowdsale.address)).toNumber(), 0, "Still have coins remaining, please adjust test case");
    });

    it("should forbid buying coins when no coin remains", async () => {
        await utils.assertSolidityThrow(async () => {
            await web3.eth.sendTransaction({ from: accounts[2], to: crowdsale.address, value: 1 });
        }, "Should not be able to buy coins when no coin remains");
    });

    it("should allow crowdsale to end early when meeting hardCap", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        assert.isBelow(now, end, "Blocktime is already after crowdsale end, please adjust test case");
        await crowdsale.finalize();
    });
});

contract("LikeCoin Crowdsale Overflow", () => {
    it("should forbid price and hardCap values which will overflow", async () => {
        // The blocktime of next block could be affected by snapshot and revert, so mine the next block immediately by
        // calling testrpcIncreaseTime
        await utils.testrpcIncreaseTime(1);
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        const coinsPerEth = 2;
        const hardCap = new BigNumber(2).pow(256).div(2);
        const like = await LikeCoin.new(1, 0);
        await utils.assertSolidityThrow(async () => {
            await LikeCrowdsale.new(like.address, now + 100, now + 200, coinsPerEth, hardCap, referrerBonusPercent);
        }, "Should forbid price and hardCap values which will overflow");
    });

    it("should forbid hardCap which will overflow", async () => {
        // The blocktime of next block could be affected by snapshot and revert, so mine the next block immediately by
        // calling testrpcIncreaseTime
        await utils.testrpcIncreaseTime(1);
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        const hardCap = new BigNumber(2).pow(256).sub(1);
        const like = await LikeCoin.new(1, 0);
        const crowdsale = await LikeCrowdsale.new(like.address, now + 100, now + 200, 1, hardCap, referrerBonusPercent);
        await utils.assertSolidityThrow(async () => {
            await like.registerCrowdsales(crowdsale.address, hardCap, now + 300);
        }, "Should forbid hardCap which will overflow");
    });
});
