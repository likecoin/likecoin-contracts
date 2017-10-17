/* eslint-env mocha, node */
/* global artifacts, contract, assert, Promise */

async function assertSolidityThrow(f, message) {
    try {
        await f();
    } catch (e) {
        if (/invalid opcode/.test(e.message)) {
            return;
        }
    }
    throw new Error(message);
}

function eventPromise(eventSource) {
    return new Promise((resolve, reject) => {
        const filter = eventSource.watch((err, event) => {
            if (err) {
                reject(err);
            } else {
                resolve(event);
            }
            filter.stopWatching();
        });
        return filter;
    });
}

const LikeCoin = artifacts.require("./LikeCoin.sol");

contract("LikeCoin", (accounts) => {
    it("should put 10000.0000000000 LikeCoin in accounts[0]", async () => {
        const like = await LikeCoin.deployed();
        const balance = await like.balanceOf(accounts[0]);
        assert.equal(balance.valueOf(), 100000000000000, "10000.0000000000 Like Coin should be put in account[0]");
    });

    it("should send coin correctly", async () => {
        const amount = 314;
        const like = await LikeCoin.deployed();
        const startingBalance0 = (await like.balanceOf(accounts[0])).toNumber();
        const startingBalance1 = (await like.balanceOf(accounts[1])).toNumber();
        await like.transfer(accounts[1], amount, {from: accounts[0]});
        const endingBalance0 = (await like.balanceOf(accounts[0])).toNumber();
        const endingBalance1 = (await like.balanceOf(accounts[1])).toNumber();
        assert.equal(endingBalance0, startingBalance0 - amount, "Sender's balance wasn't correctly changed");
        assert.equal(endingBalance1, startingBalance1 + amount, "Receiver's balance wasn't correctly changed");
        const event = await eventPromise(like.Transfer());
        assert.equal(event.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[1], "Transfer event has wrong value on field '_to'");
        assert.equal(event.args._value, amount, "Transfer event has wrong value on field '_value'");
    });

    it("should forbid sending more coin than owned", async () => {
        const like = await LikeCoin.deployed();
        const balance0 = (await like.balanceOf(accounts[0])).toNumber();
        const balance2 = (await like.balanceOf(accounts[2])).toNumber();
        await assertSolidityThrow(async () => {
            await like.transfer(accounts[1], balance0 + 1, {from: accounts[0]});
        }, "Sending more than owned should be forbidden");
        await assertSolidityThrow(async () => {
            await like.transfer(accounts[1], balance2 + 1, {from: accounts[2]});
        }, "Sending more than owned should be forbidden");
    });

    it("should allow send coin from another account", async () => {
        const allowance = 10000;
        const amount = 500;
        const like = await LikeCoin.deployed();
        const startingBalance0 = (await like.balanceOf(accounts[0])).toNumber();
        const startingBalance1 = (await like.balanceOf(accounts[1])).toNumber();
        const startingBalance2 = (await like.balanceOf(accounts[2])).toNumber();
        await like.approve(accounts[1], allowance, {from: accounts[0]});
        const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1])).toNumber();
        assert.equal(allowanceOf1On0, allowance, "Allowance wasn't correctly set");
        const approvalEvent = await eventPromise(like.Approval());
        assert.equal(approvalEvent.args._owner, accounts[0], "Approval event has wrong value on field '_owner'");
        assert.equal(approvalEvent.args._spender, accounts[1], "Approval event has wrong value on field '_spender'");
        assert.equal(approvalEvent.args._value, allowance, "Approval event has wrong value on field '_value'");
        await like.transferFrom(accounts[0], accounts[2], amount, {from: accounts[1]});
        const endingBalance0 = (await like.balanceOf(accounts[0])).toNumber();
        const endingBalance1 = (await like.balanceOf(accounts[1])).toNumber();
        const endingBalance2 = (await like.balanceOf(accounts[2])).toNumber();
        assert.equal(endingBalance0, startingBalance0 - amount, "Sender's balance wasn't correctly changed");
        assert.equal(endingBalance1, startingBalance1, "Caller's balance should not be changed");
        assert.equal(endingBalance2, startingBalance2 + amount, "Receiver's balance wasn't correctly changed");
        const transferEvent = await eventPromise(like.Transfer());
        assert.equal(transferEvent.args._from, accounts[0], "Transfer event has wrong value on field '_from'");
        assert.equal(transferEvent.args._to, accounts[2], "Transfer event has wrong value on field '_to'");
        assert.equal(transferEvent.args._value, amount, "Transfer event has wrong value on field '_value'");
        const allowanceOf1On0After = (await like.allowance(accounts[0], accounts[1])).toNumber();
        assert.equal(allowanceOf1On0After, allowance - amount, "Allowance wasn't correctly changed");
    });

    it("should not allow arbitrary transferFrom", async () => {
        const like = await LikeCoin.deployed();
        const allowanceOf1On0 = (await like.allowance(accounts[0], accounts[1])).toNumber();
        await assertSolidityThrow(async () => {
            await like.transferFrom(accounts[0], accounts[2], allowanceOf1On0, {from: accounts[2]});
        }, "Unallowed transferFrom should be forbidden");
        await assertSolidityThrow(async () => {
            await like.transferFrom(accounts[1], accounts[0], allowanceOf1On0, {from: accounts[1]});
        }, "Unallowed transferFrom should be forbidden");
        await assertSolidityThrow(async () => {
            await like.transferFrom(accounts[0], accounts[2], allowanceOf1On0 + 1, {from: accounts[1]});
        }, "transferFrom exceeding allowance should be forbidden");
    });
});
