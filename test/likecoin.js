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
    let like;

    before(async () => {
        like = await LikeCoin.new(initialAmount, initialAmount);
    });

    it(`should set totalSupply correctly`, async () => {
        const supply = await like.totalSupply();
        assert(supply.eq(initialAmount), `total supply should be set to ${initialAmount} units of coins`);
    });

    it(`should put coins into account[0] by airdrop`, async () => {
        // hack
        await like.airdrop([accounts[0]], initialAmount);
        const balance = await like.balanceOf(accounts[0]);
        assert(balance.eq(initialAmount), `${initialAmount} units of coins should be put in account[0]`);
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
});

contract("LikeCoinEvents", (accounts) => {
    const initialAmount = coinsToCoinUnits(10000);
    let like;

    before(async () => {
        like = await LikeCoin.new(initialAmount, initialAmount);
        // hack
        await like.airdrop([accounts[0]], initialAmount);
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
});
