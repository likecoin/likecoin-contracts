/* eslint-env mocha, node */
/* global artifacts, contract, assert */

const utils = require("./utils.js");
const BigNumber = require("bignumber.js");
const LikeCoin = artifacts.require("./LikeCoin.sol");

const decimalFactor = new BigNumber(10).pow(18);

function coinsToCoinUnits(value) {
    return decimalFactor.times(value);
}

contract("LikeCoin", (accounts) => {
    const initialAmount = coinsToCoinUnits(10000);
    const airdropLimit = initialAmount.div(10);
    let like;

    before(async () => {
        like = await LikeCoin.new(initialAmount, airdropLimit);
    });

    it(`should set totalSupply correctly`, async () => {
        const supply = await like.totalSupply();
        assert(supply.eq(initialAmount), `total supply should be set to ${initialAmount} units of coins`);
    });

    it(`should airdrop coins into accounts`, async () => {
        await like.airdrop([accounts[0], accounts[1], accounts[2]], airdropLimit);
        assert((await like.balanceOf(accounts[0])).eq(airdropLimit), `accounts[0] owns wrong amount of coins after airdrop`);
        assert((await like.balanceOf(accounts[1])).eq(airdropLimit), `accounts[1] owns wrong amount of coins after airdrop`);
        assert((await like.balanceOf(accounts[2])).eq(airdropLimit), `accounts[2] owns wrong amount of coins after airdrop`);
    });

    it(`should forbid airdroping coins more than limit`, async () => {
        await utils.assertSolidityThrow(async () => {
            await like.airdrop([accounts[0]], airdropLimit.add(1));
        }, "Airdroping more than limit should be forbidden");
    });

    it(`should forbid airdroping coins more than remaining`, async () => {
        const remaining = initialAmount.sub(airdropLimit.times(3));
        const airdropAmount = remaining.div(8).floor().add(1);
        assert(airdropAmount.lt(airdropLimit), "Airdrop amount is greater than airdrop limit, please check test case");
        assert(airdropAmount.times(8).gt(remaining), "Total airdrop amount is less than remaining, please check test case");
        await utils.assertSolidityThrow(async () => {
            await like.airdrop([accounts[0], accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6], accounts[7]], airdropAmount);
        }, "Airdroping more than remaining should be forbidden");
    });

    const transferAmount = 314;
    it(`should transfer ${transferAmount} units of coins from accounts[0] to accounts[1]`, async () => {
        const startingBalance0 = (await like.balanceOf(accounts[0]));
        const startingBalance1 = (await like.balanceOf(accounts[1]));
        await like.transfer(accounts[1], transferAmount, {from: accounts[0]});
        const endingBalance0 = (await like.balanceOf(accounts[0]));
        const endingBalance1 = (await like.balanceOf(accounts[1]));
        assert(endingBalance0.eq(startingBalance0.sub(transferAmount)), "Sender's balance wasn't correctly changed");
        assert(endingBalance1.eq(startingBalance1.add(transferAmount)), "Receiver's balance wasn't correctly changed");
    });

    it("should forbid accounts[0] to transfer more coins than it owned", async () => {
        const balance0 = (await like.balanceOf(accounts[0]));
        const balance2 = (await like.balanceOf(accounts[2]));
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[1], balance0.add(1), {from: accounts[0]});
        }, "Sending more than owned should be forbidden");
        await utils.assertSolidityThrow(async () => {
            await like.transfer(accounts[1], balance2.add(1), {from: accounts[2]});
        }, "Sending more than owned should be forbidden");
    });

    const allowance = new BigNumber(10000);
    it(`should allow accounts[1] to transfer at most ${allowance} units of coins from accounts[0] to accounts[2]`, async () => {
        const startingBalance0 = (await like.balanceOf(accounts[0]));
        const startingBalance1 = (await like.balanceOf(accounts[1]));
        const startingBalance2 = (await like.balanceOf(accounts[2]));
        await like.approve(accounts[1], allowance, {from: accounts[0]});
        const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1]));
        assert(allowanceOf1On0.eq(allowance), "Allowance wasn't correctly set");
        await like.transferFrom(accounts[0], accounts[2], transferAmount, {from: accounts[1]});
        const endingBalance0 = (await like.balanceOf(accounts[0]));
        const endingBalance1 = (await like.balanceOf(accounts[1]));
        const endingBalance2 = (await like.balanceOf(accounts[2]));
        assert(endingBalance0.eq(startingBalance0.sub(transferAmount)), "Sender's balance wasn't correctly changed");
        assert(endingBalance1.eq(startingBalance1), "Caller's balance should not be changed");
        assert(endingBalance2.eq(startingBalance2.add(transferAmount)), "Receiver's balance wasn't correctly changed");
        const allowanceOf1On0After = (await like.allowance(accounts[0], accounts[1]));
        assert(allowanceOf1On0After.eq(allowance.sub(transferAmount)), "Allowance wasn't correctly changed");
    });

    it("should forbid unapproved transferFrom", async () => {
        const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1]));
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[2], accounts[0], allowanceOf1On0, {from: accounts[1]});
        }, "transferFrom with invalid owner should be forbidden");
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[0], accounts[2], allowanceOf1On0, {from: accounts[2]});
        }, "transferFrom with invalid spender should be forbidden");
    });

    it("should forbid transferFrom more than allowance value", async () => {
        const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1]));
        await utils.assertSolidityThrow(async () => {
            await like.transferFrom(accounts[0], accounts[2], allowanceOf1On0.add(1), {from: accounts[1]});
        }, "transferFrom exceeding allowance should be forbidden");
    });

    it("should burn correct amount of coins", async () => {
        const supplyBefore = await like.totalSupply();
        const balance0Before = await like.balanceOf(accounts[0]);
        const toBurn = balance0Before.div(2).floor();
        assert(!balance0Before.eq(0), "Banalce in accounts[0] is 0 before buring, please check test case");
        assert(!toBurn.eq(0), "Burning amount is 0, please check test case");
        await like.burn(toBurn);
        assert((await like.balanceOf(accounts[0])).eq(balance0Before.sub(toBurn)), "Wrong amount of coins remaining after burning");
        assert((await like.totalSupply()).eq(supplyBefore.sub(toBurn)), "Wrong amount of supply remaining after burning");
    });
});

contract("LikeCoinEvents", (accounts) => {
    const initialAmount = coinsToCoinUnits(10000);
    let like;

    before(async () => {
        like = await LikeCoin.new(initialAmount, initialAmount);
    });

    it("should emit Transfer event after transaction", async () => {
        await like.airdrop([accounts[0]], initialAmount);
        const event = await utils.solidityEventPromise(like.Transfer());
        assert.equal(event.args._from, like.address, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(initialAmount), "Transfer event has wrong value on field '_value'");
    });

    const transferAmount = 271;
    it("should emit Transfer event after transaction", async () => {
        await like.transfer(accounts[1], transferAmount, {from: accounts[0]});
        const event = await utils.solidityEventPromise(like.Transfer());
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[1], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(transferAmount), "Transfer event has wrong value on field '_value'");
    });

    const allowance = 10000;
    it(`should emit Approval event after approve`, async () => {
        await like.approve(accounts[1], allowance, {from: accounts[0]});
        const approvalEvent = await utils.solidityEventPromise(like.Approval());
        assert.equal(approvalEvent.args._owner, accounts[0], "Approval event has wrong value on field '_owner'");
        assert.equal(approvalEvent.args._spender, accounts[1], "Approval event has wrong value on field '_spender'");
        assert(approvalEvent.args._value.eq(allowance), "Approval event has wrong value on field '_value'");
    });

    const burnAmount = 161;
    it(`should emit Transfer event after burn`, async () => {
        await like.burn(burnAmount);
        const event = await utils.solidityEventPromise(like.Transfer());
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, 0x0, "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(burnAmount), "Transfer event has wrong value on field '_value'");
    });

    const crowdsaleAmount = 100000;
    it(`should emit Transfer event after minting for crowdsale`, async () => {
        await like.registerCrowdsales(accounts[0], crowdsaleAmount);
        const event = await utils.solidityEventPromise(like.Transfer());
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(crowdsaleAmount), "Transfer event has wrong value on field '_value'");
    });

    const contributorPoolAmount = 200000;
    it(`should emit Transfer event after minting for contributor pool`, async () => {
        await like.registerContributorPool(accounts[0], contributorPoolAmount);
        const event = await utils.solidityEventPromise(like.Transfer());
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(contributorPoolAmount), "Transfer event has wrong value on field '_value'");
    });

    const userGrowthPoolAmount = 300000;
    it(`should emit Transfer event after minting for user growth pool`, async () => {
        await like.registerUserGrowthPools([accounts[0]]);
        await like.mintForUserGrowthPool(userGrowthPoolAmount);
        const event = await utils.solidityEventPromise(like.Transfer());
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[0], "Transfer event has wrong value on field '_to'");
        assert(event.args._value.eq(userGrowthPoolAmount), "Transfer event has wrong value on field '_value'");
    });
});
