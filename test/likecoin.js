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

contract("LikeCoin", (accounts) => {
    const initialAmount = coinsToCoinUnits(10000);
    const airdropMax = initialAmount.div(10);
    let like;

    before(async () => {
        like = await LikeCoin.new(initialAmount);
    });

    it(`should deploy LikeCoin contract correctly`, async () => {
        assert((await like.totalSupply()).eq(initialAmount), "Wrong initial supply");
        assert((await like.balanceOf(accounts[0])).eq(initialAmount), "Wrong balance");
        assert.equal(await like.owner(), accounts[0], "Wrong owner");
    });

    it(`should airdrop coins into accounts`, async () => {
        const balanceBefore = await like.balanceOf(accounts[0]);
        await like.transferMultiple([accounts[1], accounts[2], accounts[3]], airdropMax, {from: accounts[0]});
        assert((await like.balanceOf(accounts[1])).eq(airdropMax), `accounts[1] owns wrong amount of coins after airdrop`);
        assert((await like.balanceOf(accounts[2])).eq(airdropMax), `accounts[2] owns wrong amount of coins after airdrop`);
        assert((await like.balanceOf(accounts[3])).eq(airdropMax), `accounts[3] owns wrong amount of coins after airdrop`);
        assert((await like.balanceOf(accounts[0])).eq(balanceBefore.sub(airdropMax.times(3))), `Wrong balance after airdrop`);
    });

    it(`should forbid airdroping coins more than remaining`, async () => {
        const remaining = await like.balanceOf(accounts[0]);
        const airdropAmount = remaining.div(8).floor().add(1);
        assert(airdropAmount.times(8).gt(remaining), "Total airdrop amount is less than remaining, please check test case");
        await utils.assertSolidityThrow(async () => {
            await like.transferMultiple([accounts[0], accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7]], airdropAmount, {from: accounts[0]});
        }, "Airdroping more than remaining should be forbidden");
    });

    it(`should allow airdroping exactly all the remaining LIKE`, async () => {
        const remaining = await like.balanceOf(accounts[0]);
        const airdropAmount = remaining.div(8).floor();
        assert(airdropAmount.times(8).eq(remaining), "Total airdrop amount does not equal to remaining, please check test case");
        await like.transferMultiple([accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7], accounts[8]], airdropAmount, {from: accounts[0]});
        assert((await like.balanceOf(accounts[0])).eq(0), "Still have some LIKE remaining, please check test case");
    });

    const transferAmount = 314;
    it(`should transfer ${transferAmount} units of coins from accounts[1] to accounts[2]`, async () => {
        const startingBalance1 = (await like.balanceOf(accounts[1]));
        const startingBalance2 = (await like.balanceOf(accounts[2]));
        await like.transfer(accounts[2], transferAmount, {from: accounts[1]});
        const endingBalance1 = (await like.balanceOf(accounts[1]));
        const endingBalance2 = (await like.balanceOf(accounts[2]));
        assert(endingBalance1.eq(startingBalance1.sub(transferAmount)), "Sender's balance wasn't correctly changed");
        assert(endingBalance2.eq(startingBalance2.add(transferAmount)), "Receiver's balance wasn't correctly changed");
    });

    it("should forbid accounts[1] to transfer more coins than it owned", async () => {
        const balance0 = (await like.balanceOf(accounts[1]));
        const balance2 = (await like.balanceOf(accounts[3]));
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[2], balance0.add(1), {from: accounts[1]});
        }, "Sending more than owned should be forbidden");
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[2], balance2.add(1), {from: accounts[3]});
        }, "Sending more than owned should be forbidden");
    });

    const allowance = new BigNumber(10000);
    it(`should allow accounts[2] to transfer at most ${allowance} units of coins from accounts[1] to accounts[3]`, async () => {
        const startingBalance1 = (await like.balanceOf(accounts[1]));
        const startingBalance2 = (await like.balanceOf(accounts[2]));
        const startingBalance3 = (await like.balanceOf(accounts[3]));
        await like.approve(accounts[2], allowance, {from: accounts[1]});
        const allowanceOf2On1 = (await like.allowance(accounts[1], accounts[2]));
        assert(allowanceOf2On1.eq(allowance), "Allowance wasn't correctly set");
        await like.transferFrom(accounts[1], accounts[3], transferAmount, {from: accounts[2]});
        const endingBalance1 = (await like.balanceOf(accounts[1]));
        const endingBalance2 = (await like.balanceOf(accounts[2]));
        const endingBalance3 = (await like.balanceOf(accounts[3]));
        assert(endingBalance1.eq(startingBalance1.sub(transferAmount)), "Sender's balance wasn't correctly changed");
        assert(endingBalance2.eq(startingBalance2), "Caller's balance should not be changed");
        assert(endingBalance3.eq(startingBalance3.add(transferAmount)), "Receiver's balance wasn't correctly changed");
        const allowanceOf2On1After = (await like.allowance(accounts[1], accounts[2]));
        assert(allowanceOf2On1After.eq(allowance.sub(transferAmount)), "Allowance wasn't correctly changed");
    });

    it("should forbid unapproved transferFrom", async () => {
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[3], accounts[1], 1, {from: accounts[2]});
        }, "transferFrom with invalid owner should be forbidden");
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[1], accounts[3], 1, {from: accounts[3]});
        }, "transferFrom with invalid spender should be forbidden");
    });

    it("should forbid transferFrom more than allowance value", async () => {
        const allowanceOf2On1 = (await like.allowance(accounts[1], accounts[2]));
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[1], accounts[3], allowanceOf2On1.add(1), {from: accounts[2]});
        }, "transferFrom exceeding allowance should be forbidden");
    });

    it("should allow transfer all allowance in once", async () => {
        const allowanceOf2On1 = await like.allowance(accounts[1], accounts[2]);
        const startingBalance1 = (await like.balanceOf(accounts[1]));
        const startingBalance2 = (await like.balanceOf(accounts[2]));
        const startingBalance3 = (await like.balanceOf(accounts[3]));
        await like.transferFrom(accounts[1], accounts[3], allowanceOf2On1, {from: accounts[2]});
        const endingBalance1 = (await like.balanceOf(accounts[1]));
        const endingBalance2 = (await like.balanceOf(accounts[2]));
        const endingBalance3 = (await like.balanceOf(accounts[3]));
        assert(endingBalance1.eq(startingBalance1.sub(allowanceOf2On1)), "Sender's balance wasn't correctly changed");
        assert(endingBalance2.eq(startingBalance2), "Caller's balance should not be changed");
        assert(endingBalance3.eq(startingBalance3.add(allowanceOf2On1)), "Receiver's balance wasn't correctly changed");
        const allowanceOf2On1After = (await like.allowance(accounts[1], accounts[2]));
        assert(allowanceOf2On1After.eq(0), "Allowance wasn't correctly changed");
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[1], accounts[3], 1, {from: accounts[2]});
        }, "Allowance should be all consumed already");
    });

    it("should allow transfer 0 LIKE", async () => {
        await like.transfer(accounts[1], 0, {from: accounts[0]});
    });

    it("should allow transfer all balance", async () => {
        const balance1Before = await like.balanceOf(accounts[1]);
        const balance2Before = await like.balanceOf(accounts[2]);
        await like.transfer(accounts[2], balance1Before, {from: accounts[1]});
        assert((await like.balanceOf(accounts[1])).eq(0), "Sender should not have balance remaining");
        assert((await like.balanceOf(accounts[2])).eq(balance1Before.add(balance2Before)), "Receiver's balance wasn't correctly changed");
    });

    it("should reset allowance correctly", async () => {
        const balance1Before = await like.balanceOf(accounts[1]);
        const balance3Before = await like.balanceOf(accounts[3]);
        await like.approve(accounts[2], 2000, {from: accounts[3]});
        await like.transferFrom(accounts[3], accounts[1], 1000, {from: accounts[2]});
        await like.approve(accounts[2], 1, {from: accounts[3]});
        assert((await like.allowance(accounts[3], accounts[2])).eq(1), "Allowance is not correctly reset to 1 unit");
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[3], accounts[1], 1000, {from: accounts[2]});
        }, "transferFrom should fail after resetting allowance to lower than the call value");
        await like.transferFrom(accounts[3], accounts[1], 1, {from: accounts[2]});
        assert((await like.allowance(accounts[3], accounts[2])).eq(0), "Allowance is not correctly decreased to 0 unit");
        await like.approve(accounts[2], 1000, {from: accounts[3]});
        assert((await like.allowance(accounts[3], accounts[2])).eq(1000), "Allowance is not correctly reset to 1000 units");
        await like.transferFrom(accounts[3], accounts[1], 1000, {from: accounts[2]});
        assert((await like.balanceOf(accounts[1])).eq(balance1Before.add(2001)), "Receiver's balance wasn't correctly changed");
        assert((await like.balanceOf(accounts[3])).eq(balance3Before.sub(2001)), "Sender's balance wasn't correctly changed");
    });

    it("should maintain the total supply unchanged", async () => {
        assert((await like.totalSupply()).eq(initialAmount), "Total supply should not change");
    });

    it("should burn correct amount of coins", async () => {
        const supplyBefore = await like.totalSupply();
        const balance1Before = await like.balanceOf(accounts[1]);
        const toBurn = balance1Before.div(2).floor();
        assert(!balance1Before.eq(0), "Banalce in accounts[1] is 0 before buring, please check test case");
        assert(!toBurn.eq(0), "Burning amount is 0, please check test case");
        await like.burn(toBurn, {from: accounts[1]});
        assert((await like.balanceOf(accounts[1])).eq(balance1Before.sub(toBurn)), "Wrong amount of coins remaining after burning");
        assert((await like.totalSupply()).eq(supplyBefore.sub(toBurn)), "Wrong amount of supply remaining after burning");
    });

    it("should transfer and lock correctly", async () => {
        const unlockTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 10000;
        await like.registerCrowdsales(accounts[2], 1, unlockTime);
        const balance1Before = await like.balanceOf(accounts[1]);
        const balance2 = await like.balanceOf(accounts[2]);
        assert(!balance1Before.eq(0), "Banalce in accounts[1] is 0, please check test case");
        assert(!balance2.eq(0), "Banalce in accounts[2] is 0, please check test case");
        await utils.assertSolidityThrow(async () => {
            await like.transferAndLock(accounts[2], 1, {from: accounts[1]});
        }, "Only crowdsale address can call transferAndLock");
        await like.transferAndLock(accounts[1], balance2, {from: accounts[2]});
        assert((await like.balanceOf(accounts[1])).eq(balance1Before.add(balance2)), "Wrong amount of coins in accounts[1] after transferAndLock");
        assert((await like.balanceOf(accounts[2])).eq(0), "Wrong amount of coins in accounts[2] after transferAndLock");
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[2], balance1Before.add(1), {from: accounts[1]});
        }, "Should not be able to transfer locked part in balance before unlockTime");
        await like.transfer(accounts[2], balance1Before, {from: accounts[1]});
        assert((await like.balanceOf(accounts[1])).eq(balance2), "Wrong amount of coins in accounts[1] after transferAndLock");
        assert((await like.balanceOf(accounts[2])).eq(balance1Before), "Wrong amount of coins in accounts[2] after transferAndLock");
        await like.transfer(accounts[1], balance1Before, {from: accounts[2]});
        assert((await like.balanceOf(accounts[1])).eq(balance1Before.add(balance2)), "Wrong amount of coins in accounts[1] after transferAndLock");
        assert((await like.balanceOf(accounts[2])).eq(0), "Wrong amount of coins in accounts[2] after transferAndLock");
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(unlockTime + 1 - now);
        await like.transfer(accounts[2], balance1Before.add(1), {from: accounts[1]});
        assert((await like.balanceOf(accounts[1])).eq(balance2.sub(1)), "Wrong balance on accounts[1] after unlock");
        assert((await like.balanceOf(accounts[2])).eq(balance1Before.add(1)), "Wrong balance on accounts[2] after unlock");

        assert(!(await like.balanceOf(accounts[1])).eq(0), "accounts[1] has no balance left for transferAndLock, please check test case");
        await utils.assertSolidityThrow(async () => {
            await like.transferAndLock(accounts[2], 1, {from: accounts[1]});
        }, "Should not be able to transferAndLock after unlockTime");
    });
});

contract("LikeCoinEvents", (accounts) => {
    const initialAmount = coinsToCoinUnits(10000);
    let like;

    before(async () => {
        like = await LikeCoin.new(initialAmount);
    });

    it("should emit Transfer event after transaction", async () => {
        const callResult = await like.transferMultiple([accounts[0], accounts[1], accounts[2]], 10000, {from: accounts[0]});
        const logs = callResult.logs.filter((log) => log.event === "Transfer");
        assert.equal(logs.length, 3,  "Wrong number of Transfer events");
        for (let i = 0; i < 2; ++i) {
            const events = logs.filter((log) => log.args._to === accounts[i]);
            assert.equal(events.length, 1, `Wrong number of Transfer events for accounts[${i}]`);
            const event = events[0];
            assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
            assert(event.args._value.eq(10000), "Transfer event has wrong value on field '_value'");
        }
    });

    const transferAmount = 271;
    it("should emit Transfer event after transaction", async () => {
        const callResult = await like.transfer(accounts[1], transferAmount, {from: accounts[0]});
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[1], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(transferAmount), "Transfer event has wrong value on field '_value'");
    });

    const allowance = 10000;
    it(`should emit Approval event after approve`, async () => {
        const callResult = await like.approve(accounts[1], allowance, {from: accounts[0]});
        const event = utils.solidityEvent(callResult, "Approval");
        assert.equal(event.args._owner, accounts[0], "Approval event has wrong value on field '_owner'");
        assert.equal(event.args._spender, accounts[1], "Approval event has wrong value on field '_spender'");
        assert(event.args._value.eq(allowance), "Approval event has wrong value on field '_value'");
    });

    it("should emit Transfer event after transferFrom", async () => {
        const callResult = await like.transferFrom(accounts[0], accounts[2], transferAmount, {from: accounts[1]});
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[2], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(transferAmount), "Transfer event has wrong value on field '_value'");
    });

    const burnAmount = 161;
    it(`should emit Transfer event after burn`, async () => {
        const callResult = await like.burn(burnAmount);
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, 0x0, "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(burnAmount), "Transfer event has wrong value on field '_value'");
    });

    const crowdsaleAmount = 100000;
    it(`should emit Transfer event after minting for crowdsale`, async () => {
        const unlockTime = web3.eth.getBlock(web3.eth.blockNumber).timestamp + 1000000;
        const callResult = await like.registerCrowdsales(accounts[0], crowdsaleAmount, unlockTime);
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(crowdsaleAmount), "Transfer event has wrong value on field '_value'");
    });

    const contributorPoolAmount = 200000;
    it(`should emit Transfer event after minting for contributor pool`, async () => {
        const callResult = await like.registerContributorPool(accounts[0], contributorPoolAmount);
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(contributorPoolAmount), "Transfer event has wrong value on field '_value'");
    });

    const userGrowthPoolAmount = 300000;
    it(`should emit Transfer event after minting for user growth pool`, async () => {
        await like.registerUserGrowthPools([accounts[0]]);
        const callResult = await like.mintForUserGrowthPool(userGrowthPoolAmount);
        const event = utils.solidityEvent(callResult, "Transfer");
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(userGrowthPoolAmount), "Transfer event has wrong value on field '_value'");
    });

    it("should emit Transfer and Lock events after transfer and lock", async () => {
        const balance = await like.balanceOf(accounts[0]);
        assert(!balance.eq(0), "Banalce in accounts[0] is 0, please check test case");
        const callResult = await like.transferAndLock(accounts[1], balance, {from: accounts[0]});
        const transferEvent = utils.solidityEvent(callResult, "Transfer");
        assert.equal(transferEvent.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(transferEvent.args._to, accounts[1], "Transfer event has wrong value on field '_to'");
        assert(transferEvent.args._value.eq(balance), "Transfer event has wrong value on field '_value'");
        const lockEvent = utils.solidityEvent(callResult, "Lock");
        assert.equal(lockEvent.args._addr, accounts[1], "Lock event has wrong value on field '_addr'");
        assert(lockEvent.args._value.eq(balance), "Lock event has wrong value on field '_value'");
    });
});
