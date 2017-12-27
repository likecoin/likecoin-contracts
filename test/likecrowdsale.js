//    Copyright (C) 2017 LikeCoin Foundation Limited
//
//    This file is part of LikeCoin Smart Contract.
//
//    LikeCoin Smart Contract is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    LikeCoin Smart Contract is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with LikeCoin Smart Contract.  If not, see <http://www.gnu.org/licenses/>.

/* eslint-env mocha, node */
/* global artifacts, contract, assert, web3 */

const utils = require("./utils.js");
const coinsToCoinUnits = utils.coinsToCoinUnits;
const BigNumber = require("bignumber.js");
const LikeCoin = artifacts.require("./LikeCoin.sol");
const LikeCrowdsale = artifacts.require("./LikeCrowdsale.sol");

const initialSupply = coinsToCoinUnits(10);
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
        1: buyCoins[1].div(coinsPerEth), // 1 Ether
        2: buyCoins[2].div(coinsPerEth), // 320 Ether
        3: buyCoins[3].div(coinsPerEth), // 280 Ether
        4: buyCoins[4].div(coinsPerEth) // 2,519 Ether
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
        like = await LikeCoin.new(initialSupply);
        crowdsale = await LikeCrowdsale.new(like.address, start, end, coinsPerEth, hardCap, referrerBonusPercent);
    });

    it("should deploy the crowdsale contract correctly", async () => {
        assert.equal(await crowdsale.owner(), accounts[0], `LikeCrowdsale contract has wrong owner`);
        assert((await crowdsale.start()).eq(start), `LikeCrowdsale contract has wrong start`);
        assert((await crowdsale.end()).eq(end), `LikeCrowdsale contract has wrong end`);
        assert((await crowdsale.coinsPerEth()).eq(coinsPerEth), `LikeCrowdsale contract has wrong coinsPerEth`);
        assert((await crowdsale.hardCap()).eq(hardCap), `LikeCrowdsale contract has wrong hardCap`);
        assert((await crowdsale.referrerBonusPercent()).eq(referrerBonusPercent), `LikeCrowdsale contract has wrong referrerBonusPercent`);
        assert.equal(await crowdsale.isPrivateFundFinalized(), false, `LikeCrowdsale contract has wrong privateFundFinalized`);
    });

    it("should forbid non-owner to register crowdsale contract", async () => {
        await utils.assertSolidityThrow(async () => {
            await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime, {from: accounts[1]});
        }, "should forbid accounts[1] to register crowdsale contract");
    });

    it(`should mint ${hardCap.toFixed()} units of coins`, async () => {
        await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
        const supply = await like.totalSupply();
        const expected = initialSupply.add(hardCap);
        assert(supply.eq(expected), `${expected.toFixed()} units of coins should be minted`);
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

        const privateFundEvent1 = utils.solidityEvent(await crowdsale.addPrivateFund(accounts[5], privateFunds[5].sub(100)), "AddPrivateFund");
        assert.equal(privateFundEvent1.args._addr, accounts[5], "AddPrivateFund event has wrong value on field '_addr'");
        assert(privateFundEvent1.args._value.eq(privateFunds[5].sub(100)), "AddPrivateFund event has wrong value on field '_value'");
        const remaining2 = await like.balanceOf(crowdsale.address);
        const account5Coins = await like.balanceOf(accounts[5]);
        assert(remaining2.eq(remaining1.sub(privateFunds[5].sub(100))), "Wrong remaining coins after adding private fund");
        assert(account5Coins.eq(privateFunds[5].sub(100)), "Wrong amount of coins on accounts[5] after adding private fund (1st time)");

        const privateFundEvent2 = utils.solidityEvent(await crowdsale.addPrivateFund(accounts[6], privateFunds[6]), "AddPrivateFund");
        assert.equal(privateFundEvent2.args._addr, accounts[6], "AddPrivateFund event has wrong value on field '_addr'");
        assert(privateFundEvent2.args._value.eq(privateFunds[6]), "AddPrivateFund event has wrong value on field '_value'");
        const remaining3 = await like.balanceOf(crowdsale.address);
        const account6Coins = await like.balanceOf(accounts[6]);
        assert(remaining3.eq(remaining2.sub(privateFunds[6])), "Wrong remaining coins after adding private fund");
        assert(account6Coins.eq(privateFunds[6]), "Wrong amount of coins on accounts[6] after adding private fund");

        const privateFundEvent3 = utils.solidityEvent(await crowdsale.addPrivateFund(accounts[5], 100), "AddPrivateFund");
        assert.equal(privateFundEvent3.args._addr, accounts[5], "AddPrivateFund event has wrong value on field '_addr'");
        assert(privateFundEvent3.args._value.eq(100), "AddPrivateFund event has wrong value on field '_value'");
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
        const remaining = await like.balanceOf(crowdsale.address);
        assert(!remaining.eq(0), "Remaining coins is 0, please check test case");
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[7], remaining, {from: accounts[1]});
        }, "should forbid adding private fund from accounts[1]");
    });

    it("should forbid non-owner to finalize private fund", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalizePrivateFund({from: accounts[1]});
        }, "should forbid finalizing private fund from accounts[1]");
    });

    it("should forbid adding private fund after finalizing private fund", async () => {
        const finalizeFlag1 = await crowdsale.isPrivateFundFinalized();
        assert.equal(finalizeFlag1, false, "Finalize flag is already set before finalizing private fund, please adjust test case");
        utils.solidityEvent(await crowdsale.finalizePrivateFund(), "FinalizePrivateFund");
        const finalizeFlag2 = await crowdsale.isPrivateFundFinalized();
        assert.equal(finalizeFlag2, true, "Finalize flag should be not set");
        const remaining = await like.balanceOf(crowdsale.address);
        assert(!remaining.eq(0), "Remaining coins is 0, please check test case");
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[7], remaining);
        }, "should forbid adding private fund after finalizing private fund");
    });

    it("should lock private fund until unlock time", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        assert.isBelow(now, unlockTime, "Blocktime is already after unlock time, please adjust test case");
        const balance = await like.balanceOf(accounts[5]);
        assert(!balance.eq(0), "Remaining coins is 0, please check test case");
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[7], 1, {from: accounts[5]});
        }, "should lock private fund until unlock time");
    });

    it("should forbid buying coins before crowdsale starts", async () => {
        const event = utils.solidityEvent(await crowdsale.registerKYC([accounts[1]]), "RegisterKYC");
        assert.equal(event.args._addr, accounts[1], "RegisterKYC event has wrong value on field '_addr'");
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        assert.isBelow(now, start, "Blocktime is already after crowdsale start, please adjust test case");
        await utils.assertSolidityThrow(async() => {
            await web3.eth.sendTransaction({from: accounts[1], to: crowdsale.address, value: buyWeis[1], gas: "200000"});
        }, "Buying coins before crowdsale starts should be forbidden");
    });

    it("should forbid buying coins before KYC", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(start + 1 - now);
        await utils.assertSolidityThrow(async() => {
            await web3.eth.sendTransaction({from: accounts[2], to: crowdsale.address, value: buyWeis[2], gas: "200000"});
        }, "Buying coins before KYC should be forbidden");
    });

    it("should allow buying coins after KYC", async () => {
        const remaining1 = await like.balanceOf(crowdsale.address);
        await web3.eth.sendTransaction({from: accounts[1], to: crowdsale.address, value: buyWeis[1], gas: "200000"});
        const purchaseEvent1 = await utils.solidityEventPromise(crowdsale.Purchase());
        assert.equal(purchaseEvent1.args._addr, accounts[1], "Purchase event has wrong value on field '_addr'");
        assert(purchaseEvent1.args._ethers.eq(buyWeis[1]), "Purchase event has wrong value on field '_ethers'");
        assert(purchaseEvent1.args._coins.eq(buyCoins[1]), "Purchase event has wrong value on field '_coins'");
        const remaining2 = await like.balanceOf(crowdsale.address);
        assert(remaining1.sub(buyCoins[1]).eq(remaining2), "Wrong remaining coins after accounts[1] buying coins");
        const account1Coins = await like.balanceOf(accounts[1]);
        assert(account1Coins.eq(buyCoins[1]), "Wrong amount of coins given after accounts[1] buying coins");
        const registerKYCEvents = (await crowdsale.registerKYC([accounts[2], accounts[3], accounts[4]])).logs.filter((e) => e.event === "RegisterKYC");
        assert.equal(registerKYCEvents.length, 3, "Wrong Number of RegisterKYC events");
        [2, 3, 4].forEach((accountIndex) => {
            const event = registerKYCEvents.filter((e) => e.event === "RegisterKYC" && e.args._addr === accounts[accountIndex]);
            assert.equal(event.length, 1, "Wrong number of RegisterKYC events");
        });
        await web3.eth.sendTransaction({from: accounts[2], to: crowdsale.address, value: buyWeis[2], gas: "200000"});
        const purchaseEvent2 = await utils.solidityEventPromise(crowdsale.Purchase());
        assert.equal(purchaseEvent2.args._addr, accounts[2], "Purchase event has wrong value on field '_addr'");
        assert(purchaseEvent2.args._ethers.eq(buyWeis[2]), "Purchase event has wrong value on field '_ethers'");
        assert(purchaseEvent2.args._coins.eq(buyCoins[2]), "Purchase event has wrong value on field '_coins'");
        const remaining3 = await like.balanceOf(crowdsale.address);
        assert(remaining2.sub(buyCoins[2]).eq(remaining3), "Wrong remaining coins after accounts[2] buying coins");
        const account2Coins = await like.balanceOf(accounts[2]);
        assert(account2Coins.eq(buyCoins[2]), "Wrong amount of coins given after accounts[2] buying coins");
    });

    it("should calculate bonus correctly", async () => {
        const registerReferrerEvent1 = utils.solidityEvent(await crowdsale.registerReferrer(accounts[3], accounts[7]), "RegisterReferrer");
        assert.equal(registerReferrerEvent1.args._addr, accounts[3], "registerReferrer event has wrong value on field '_addr'");
        assert.equal(registerReferrerEvent1.args._referrer, accounts[7], "registerReferrer event has wrong value on field '_referrer'");

        const remaining1 = await like.balanceOf(crowdsale.address);
        await web3.eth.sendTransaction({from: accounts[3], to: crowdsale.address, value: buyWeis[3], gas: "200000"});
        const purchaseEvent1 = await utils.solidityEventPromise(crowdsale.Purchase());
        assert.equal(purchaseEvent1.args._addr, accounts[3], "Purchase event has wrong value on field '_addr'");
        assert(purchaseEvent1.args._ethers.eq(buyWeis[3]), "Purchase event has wrong value on field '_ethers'");
        assert(purchaseEvent1.args._coins.eq(buyCoins[3]), "Purchase event has wrong value on field '_coins'");

        const bonus1 = buyCoins[3].mul(referrerBonusPercent).div(100);
        const referrerBonusEvent1 = await utils.solidityEventPromise(crowdsale.ReferrerBonus());
        assert.equal(referrerBonusEvent1.args._referrer, accounts[7], "Purchase event has wrong value on field '_referrer'");
        assert.equal(referrerBonusEvent1.args._buyer, accounts[3], "Purchase event has wrong value on field '_buyer'");
        assert(referrerBonusEvent1.args._bonus.eq(bonus1), "Purchase event has wrong value on field '_bonus'");

        const remaining2 = await like.balanceOf(crowdsale.address);
        const account3Coins = await like.balanceOf(accounts[3]);
        assert(account3Coins.eq(buyCoins[3]), "Wrong amount of coins given after accounts[3] buying coins");
        const account7Coins = await like.balanceOf(accounts[7]);
        assert(account7Coins.eq(bonus1), "Wrong amount of bonus coins given to accounts[7] after accounts[3] buying coins");
        assert(remaining2.eq(remaining1.sub(account3Coins).sub(account7Coins)),  "Wrong remaining coins after accounts[3] buying coins");

        const registerReferrerEvent2 = utils.solidityEvent(await crowdsale.registerReferrer(accounts[4], accounts[1]), "RegisterReferrer");
        assert.equal(registerReferrerEvent2.args._addr, accounts[4], "registerReferrer event has wrong value on field '_addr'");
        assert.equal(registerReferrerEvent2.args._referrer, accounts[1], "registerReferrer event has wrong value on field '_referrer'");

        const account1CoinsBefore = await like.balanceOf(accounts[1]);
        await web3.eth.sendTransaction({from: accounts[4], to: crowdsale.address, value: buyWeis[4], gas: "200000"});
        const purchaseEvent2 = await utils.solidityEventPromise(crowdsale.Purchase());
        assert.equal(purchaseEvent2.args._addr, accounts[4], "Purchase event has wrong value on field '_addr'");
        assert(purchaseEvent2.args._ethers.eq(buyWeis[4]), "Purchase event has wrong value on field '_ethers'");
        assert(purchaseEvent2.args._coins.eq(buyCoins[4]), "Purchase event has wrong value on field '_coins'");

        const bonus2 = buyCoins[4].mul(referrerBonusPercent).div(100);
        const referrerBonusEvent2 = await utils.solidityEventPromise(crowdsale.ReferrerBonus());
        assert.equal(referrerBonusEvent2.args._referrer, accounts[1], "Purchase event has wrong value on field '_referrer'");
        assert.equal(referrerBonusEvent2.args._buyer, accounts[4], "Purchase event has wrong value on field '_buyer'");
        assert(referrerBonusEvent2.args._bonus.eq(bonus2), "Purchase event has wrong value on field '_bonus'");

        const remaining3 = await like.balanceOf(crowdsale.address);
        const account4Coins = await like.balanceOf(accounts[4]);
        assert(account4Coins.eq(buyCoins[4]), "Wrong amount of coins given after accounts[4] buying coins");
        const account1CoinsAfter = await like.balanceOf(accounts[1]);
        const account1ReferrerBonus = account1CoinsAfter.sub(account1CoinsBefore);
        assert(account1ReferrerBonus.eq(bonus2), "Wrong amount of bonus coins given to accounts[1] after accounts[4] buying coins");
        assert(remaining3.eq(remaining2.sub(account4Coins).sub(account1ReferrerBonus)),  "Wrong remaining coins after accounts[4] buying coins");
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
            await web3.eth.sendTransaction({from: accounts[7], to: crowdsale.address, value: 0, gas: "200000"});
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
            await utils.testrpcIncreaseTime(end + 1 - now);
        }
        await utils.assertSolidityThrow(async() => {
            const remaining = await like.balanceOf(crowdsale.address);
            assert(!remaining.lt(coinsPerEth), "Remaining coins is less than the value of 1 wei, please check test case");
            await web3.eth.sendTransaction({from: accounts[3], to: crowdsale.address, value: 1, gas: "200000"});
        }, "Buying coins after crowdsale ends should be forbidden");
    });

    it("should forbid non-owner to call finalize", async () => {
        await utils.assertSolidityThrow(async () => {
            await crowdsale.finalize({from: accounts[1]});
        }, "Calling finalize from non-owner should be forbidden");
    });

    it("should send ether to owner after finalization", async () => {
        const remaining = await like.balanceOf(crowdsale.address);
        assert(!remaining.eq(0), "Remaining coins is 0, please check test case");
        const ownerBalance1 = web3.eth.getBalance(accounts[0]);
        const contractBalance1 = web3.eth.getBalance(crowdsale.address);
        utils.solidityEvent(await crowdsale.finalize({gasPrice: 0}), "Finalize");
        const ownerBalance2 = web3.eth.getBalance(accounts[0]);
        const contractBalance2 = web3.eth.getBalance(crowdsale.address);
        assert(ownerBalance2.eq(ownerBalance1.add(contractBalance1)), "Wrong owner balance after finalization");
        assert(contractBalance2.eq(0), "Wrong contract balance after finalization");
        assert((await like.balanceOf(crowdsale.address)).eq(0), "No coins should remain after finalization");
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
        await utils.testrpcIncreaseTime(unlockTime + 1 - now);
        await like.transfer(accounts[7], 100, {from: accounts[5]});
    });
});

contract("LikeCoin Crowdsale 2", (accounts) => {
    const privateFunds = {
        1: coinsToCoinUnits(100000000),
    };

    const buyCoins = {
        1: coinsToCoinUnits(795000000),
        2: coinsToCoinUnits(105000000),
    };

    const buyWeis = {
        1: buyCoins[1].div(coinsPerEth), // 31,800 Ether
        2: buyCoins[2].div(coinsPerEth), // 4,200 Ether
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
        let now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        start = now + 1000;
        end = start + crowdsaleLength;
        unlockTime = now + 0xFFFFFFFF;
        like = await LikeCoin.new(0);
        crowdsale = await LikeCrowdsale.new(like.address, start, end, coinsPerEth, hardCap, referrerBonusPercent);
        await like.registerCrowdsales(crowdsale.address, hardCap, unlockTime);
        await crowdsale.addPrivateFund(accounts[1], privateFunds[1]);
        now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(start + 1 - now);
        await crowdsale.registerKYC([accounts[1], accounts[2]]);
        await web3.eth.sendTransaction({from: accounts[1], to: crowdsale.address, value: buyWeis[1], gas: "200000"});
    });

    it("should forbid adding private fund after crowdsale started", async () => {
        assert.equal(await crowdsale.isPrivateFundFinalized(), true, "isPrivateFundFinalized should be set to true");
        await utils.assertSolidityThrow(async () => {
            await crowdsale.addPrivateFund(accounts[3], 10000000);
        }, "crowdsale has already started, adding private fund should be forbidden");
    });

    it("should forbid buying more coins than remaining", async () => {
        const remaining = await like.balanceOf(crowdsale.address);
        await utils.assertSolidityThrow(async () => {
            await web3.eth.sendTransaction({from: accounts[3], to: crowdsale.address, value: remaining.div(coinsPerEth).add(1), gas: "200000"});
        }, "Buying more coins than remaining should be forbidden");

        await crowdsale.registerReferrer(accounts[3], accounts[1]);
        const toBuyWeis = remaining.mul(100).div(100 + referrerBonusPercent).div(coinsPerEth);
        assert(toBuyWeis.floor().eq(toBuyWeis), "Number of coins to buy is not an integer, check test case");
        await utils.assertSolidityThrow(async () => {
            await web3.eth.sendTransaction({from: accounts[3], to: crowdsale.address, value: toBuyWeis.add(1), gas: "200000"});
        }, "Buying more coins (bonus included) than remaining should be forbidden");
    });

    it("should allow buying exactly all remaining coins", async () => {
        await web3.eth.sendTransaction({from: accounts[2], to: crowdsale.address, value: buyWeis[2], gas: "200000"});
        assert((await like.balanceOf(crowdsale.address)).eq(0), "Still have coins remaining, please adjust test case");
    });

    it("should forbid buying coins when no coin remains", async () => {
        await utils.assertSolidityThrow(async () => {
            await web3.eth.sendTransaction({from: accounts[2], to: crowdsale.address, value: 1, gas: "200000"});
        }, "Should not be able to buy coins when no coin remains");
    });

    it("should allow crowdsale to end early when meeting hardCap", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        assert.isBelow(now, end, "Blocktime is already after crowdsale end, please adjust test case");

        const ownerBalance1 = web3.eth.getBalance(accounts[0]);
        const contractBalance1 = web3.eth.getBalance(crowdsale.address);
        await crowdsale.finalize({gasPrice: 0});
        const ownerBalance2 = web3.eth.getBalance(accounts[0]);
        const contractBalance2 = web3.eth.getBalance(crowdsale.address);
        assert(ownerBalance2.eq(ownerBalance1.add(contractBalance1)), "Wrong owner balance after finalization");
        assert(contractBalance2.eq(0), "Wrong contract balance after finalization");
    });
});

contract("LikeCoin Crowdsale Overflow", () => {
    it("should forbid hardCap which will overflow", async () => {
        // The blocktime of next block could be affected by snapshot and revert, so mine the next block immediately by
        // calling testrpcIncreaseTime
        await utils.testrpcIncreaseTime(1);
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        const hardCap = new BigNumber(2).pow(256).sub(1);
        const like = await LikeCoin.new(1);
        const crowdsale = await LikeCrowdsale.new(like.address, now + 100, now + 200, 1, hardCap, referrerBonusPercent);
        await utils.assertSolidityThrow(async () => {
            await like.registerCrowdsales(crowdsale.address, hardCap, now + 300);
        }, "Should forbid hardCap which will overflow");
    });
});
