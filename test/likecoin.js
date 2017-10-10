/* global artifacts, contract, it, assert */

const LikeCoin = artifacts.require("./LikeCoin.sol");

contract("LikeCoin", (accounts) => {
    it("should put 10000 LikeCoin in the first account", async () => {
        const like = await LikeCoin.deployed();
        const balance = await like.balanceOf.call(accounts[0]);
        assert.equal(balance.valueOf(), 100000000000000, "10000 wasn't in the first account");
    });
    it("should send coin correctly", async () => {
        const amount = 31400000000;
        const like = await LikeCoin.deployed();
        const startingBalance0 = (await like.balanceOf.call(accounts[0])).toNumber();
        const startingBalance1 = (await like.balanceOf.call(accounts[1])).toNumber();
        await like.transfer(accounts[1], amount, {from: accounts[0]});
        const endingBalance0 = (await like.balanceOf.call(accounts[0])).toNumber();
        const endingBalance1 = (await like.balanceOf.call(accounts[1])).toNumber();
        assert.equal(endingBalance0, startingBalance0 - amount, "Amount wasn't correctly taken from the sender");
        assert.equal(endingBalance1, startingBalance1 + amount, "Amount wasn't correctly sent to the receiver");
    });
});
