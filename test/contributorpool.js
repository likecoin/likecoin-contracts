/* eslint-env mocha, node */
/* global artifacts, contract, assert */

const utils = require("./utils.js");
const LikeCoin = artifacts.require("./LikeCoin.sol");
const ContributorPool = artifacts.require("./ContributorPool.sol");
const accountInfo = require("../accounts.json");
const crypto = require("crypto");

const contributorAmount = 200000000;
const testAmount = 10;
const lockTime = 2 * 86400 * 365; // 2 years

contract("ContributorPool:give", (accounts) => {
	const owners = [1, 2, 3, 4, 5].map((i) => accounts[i]);
	const threshold = 3;
	const newOwners = [5, 6, 7, 8].map((i) => accounts[i]);
	const newThreshold = 2;
    const giveId1 = []; // acct 1
    const giveId2 = []; // acct 2
    let like;
    let cp;

    before(async() => {
        like = await LikeCoin.deployed();
        cp = await ContributorPool.new(like.address, owners, lockTime, threshold);
    });

    it("deploy contributor pool", async () => {
        // TEST_CONT_0001
        // register by non-owner (acct 1)
        await utils.assertSolidityThrow(async () => {
            await like.registerContributorPool(cp.address, contributorAmount, {from: accounts[1]});
        }, "ContributorPool contract should be registered by owner only");
        // TEST_CONT_0002
        // register by owner (acct 0)
        await like.registerContributorPool(cp.address, contributorAmount, {from: accounts[0]});
        const cpBalance = (await like.balanceOf(cp.address)).toNumber();
        assert.equal(cpBalance, contributorAmount, `${contributorAmount} units of coins should be put in cp contract`);
    });

    it("deploy contributor pool again", async () => {
        // TEST_CONT_0003
        // register by owner again
        await utils.assertSolidityThrow(async () => {
            await like.registerContributorPool(cp.address, contributorAmount, {from: accounts[0]});
        }, "ContributorPool contract should be registered once only");
    });

    it("propose to give like coin (invalid owner)", async () => {
        // TEST_CONT_0004
        // propose to give like coins to acct 1 by non-owner
        const amount = testAmount;
        await utils.assertSolidityThrow(async () => {
            await cp.proposeGive(accounts[1], amount, {from:accounts[6]});
        }, "Should not allow proposal to give coins by non-owner");
    });

    it("propose to give like coin (zero value)", async () => {
        // TEST_CONT_0005
        // propose to give 0 like coins to acct 1
        const amount = 0;
        await utils.assertSolidityThrow(async () => {
            await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        }, "Should not propose to give 0 coins");
    });

    it("confirm to give like coin (confirm twice)", async () => {
        // TEST_CONT_0006
        const amount = testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await utils.assertSolidityThrow(async () => {
			// confirm a proposal twice
            await cp.confirmProposal(proposalId, {from: accounts[5]});
        }, "Should not allow confirm twice");
    });

    it("confirm to give like coin (confirm by non owner)", async () => {
        // TEST_CONT_0007
        const amount = testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await utils.assertSolidityThrow(async () => {
			// confirm by non owner
            await cp.confirmProposal(proposalId, {from: accounts[6]});
        }, "Should not allow confirm by non owner");
    });

    it("confirm to give like coin (exceed confirm threshold)", async () => {
        // TEST_CONT_0008
        const amount = testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
		assert.equal(threshold, 3);
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await cp.confirmProposal(proposalId, {from: accounts[3]});
        await utils.assertSolidityThrow(async () => {
			// confirm a proposal by 4th owner
            await cp.confirmProposal(proposalId, {from: accounts[2]});
        }, "Should not allow confirm exceed threshold");
    });

    it("execute to give like coin (exceed value)", async () => {
        // TEST_CONT_0009
        const amount = contributorAmount + 1;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await cp.confirmProposal(proposalId, {from: accounts[3]});
        await utils.assertSolidityThrow(async () => {
			// execute to give (max + 1) like coins to acct 1
            await cp.executeProposal(proposalId, {from: accounts[5]});
        }, "Should not give coins more than available number");
    });

    it("execute to give like coin (negative value/overflow)", async () => {
        // TEST_CONT_0010
        const amount = -1;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await cp.confirmProposal(proposalId, {from: accounts[3]});
        await utils.assertSolidityThrow(async () => {
			// execute to give -1 like coins to acct 1
            await cp.executeProposal(proposalId, {from: accounts[5]});
        }, "Should not give negative amount");
    });

    it("execute to give like coin (not enough confirm)", async () => {
        // TEST_CONT_0011
        const amount = testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
		assert.equal(threshold, 3);
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await utils.assertSolidityThrow(async () => {
			// execute to give -1 like coins to acct 1
            await cp.executeProposal(proposalId, {from: accounts[5]});
        }, "Should not allow not enough confirm");
    });

    it("execute to give like coin (non owner)", async () => {
        // TEST_CONT_0012
        const amount = testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await cp.confirmProposal(proposalId, {from: accounts[3]});
        await utils.assertSolidityThrow(async () => {
			// execute to give (max + 1) like coins to acct 1
            await cp.executeProposal(proposalId, {from: accounts[6]});
        }, "Should not allow non owner to execute");
    });

    it("give like coin (general case)", async () => {
        // TEST_CONT_0013
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount, "Check like coins remains. (i)");
        // give like coins to acct 1
        const amount = testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await cp.confirmProposal(proposalId, {from: accounts[3]});
		await cp.executeProposal(proposalId, {from: accounts[5]});
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount - testAmount, "Check like coins remains. (ii)");
        giveId1.push(proposalId);
        // give like coins to acct 1
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId2 = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId2, {from: accounts[5]});
        await cp.confirmProposal(proposalId2, {from: accounts[4]});
        await cp.confirmProposal(proposalId2, {from: accounts[3]});
		await cp.executeProposal(proposalId2, {from: accounts[5]});
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount - testAmount * 2, "Check like coins remains. (iii)");
        const acctBalance = (await like.balanceOf(accounts[1])).toNumber();
        assert.equal(acctBalance, 0, "0 units of coins should be in account[1], because not yet claimed");
        giveId1.push(proposalId2);

        // give like coins to acct 2
		await cp.proposeGive(accounts[2], amount, {from: accounts[5]});
        const proposalId3 = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId3, {from: accounts[5]});
        await cp.confirmProposal(proposalId3, {from: accounts[4]});
        await cp.confirmProposal(proposalId3, {from: accounts[3]});
		await cp.executeProposal(proposalId3, {from: accounts[5]});
        const acctBalance2 = (await like.balanceOf(accounts[2])).toNumber();
        assert.equal(acctBalance2, 0, "0 units of coins should be in account[2], because not yet claimed");
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount - testAmount * 3, "Check like coins remains. (iv)");
        giveId2.push(proposalId3);
    });

    it("give like coin (exceed remaining value)", async () => {
        // TEST_CONT_0014
        // give (max - testAmount) like coins to acct 1
        const amount = contributorAmount - testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await cp.confirmProposal(proposalId, {from: accounts[3]});
        await utils.assertSolidityThrow(async () => {
			await cp.executeProposal(proposalId, {from: accounts[5]});
        }, "Should not allow to execute, give coins more than remaining available number");
    });

    it("claim like coin (invalid time)", async () => {
        // TEST_CONT_0015
        // acct 1 claims like coins before unlock time
        await utils.assertSolidityThrow(async () => {
            await cp.claim(giveId1[0], {from: accounts[1]});
        }, "Should not claim like coins successfully before unlock time");
    });

    it("after two years", async () => {
        await utils.testrpcIncreaseTime(lockTime + 1);
	});

    it("claim like coin (no like coin given)", async () => {
        // TEST_CONT_0016
        // acct 3 claims like coins
        await utils.assertSolidityThrow(async () => {
            await cp.claim(0, {from: accounts[3]});
        }, "Should not claim like any coins successfully");
        const acctBalance = (await like.balanceOf(accounts[3])).toNumber();
        assert.equal(acctBalance, 0, "0 units of coins should be in account[3], because no one give like coin to this account");
    })

    it("claim like coin (general case)", async () => {
        // TEST_CONT_0017
        // acct 1 claims after 2 years
        await cp.claim(giveId1[0], {from: accounts[1]});
        let acctBalance = (await like.balanceOf(accounts[1])).toNumber();
        assert.equal(acctBalance, testAmount, `${testAmount} units of coins should be in account[1]`);
        // acct 2 claims after 2 years
        await cp.claim(giveId2[0], {from: accounts[2]});
        acctBalance = (await like.balanceOf(accounts[2])).toNumber();
        assert.equal(acctBalance, testAmount, `${testAmount} units of coins should be in account[2]`);
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount - testAmount * 3, "Check like coins remains. (v)");
    });

    it("claim like coin again", async () => {
        // TEST_CONT_0018
        // acct 1 claims same give id again
        await utils.assertSolidityThrow(async () => {
            await cp.claim(giveId1[0], {from: accounts[1]});
        }, "Should not claim like coins again successfully");
        const acctBalance = (await like.balanceOf(accounts[1])).toNumber();
        assert.equal(acctBalance, testAmount, `${testAmount} units of coins should be in account[1]`);
    });

    it("give more like coin and claim", async () => {
		// TEST_CONT_0019
        // give like coins to acct 1
        const amount = testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await cp.confirmProposal(proposalId, {from: accounts[3]});
		await cp.executeProposal(proposalId, {from: accounts[5]});
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount - testAmount * 4, "Check like coins remains. (vi)");
        giveId1.push(proposalId);
        // increase time
        await utils.testrpcIncreaseTime(lockTime + 1);
        // acct 1 claims after 2 years
        await cp.claim(giveId1[2], {from: accounts[1]});
        const acctBalance = (await like.balanceOf(accounts[1])).toNumber();
        assert.equal(acctBalance, testAmount * 2, `${testAmount} *2 units of coins should be in account[1]`);
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount - testAmount * 4, "Check like coins remains. (vii)");
    });
});
    
contract("ContributorPool:give2", (accounts) => {
	const owners = [1, 2, 3, 4, 5].map((i) => accounts[i]);
	const threshold = 3;
	const newOwners = [5, 6, 7, 8].map((i) => accounts[i]);
	const newThreshold = 2;
    const giveId3 = []; // acct 3
    const testTime = 86400 * 365;
    let like;
    let cp;

    before(async() => {
        like = await LikeCoin.new();
        cp = await ContributorPool.new(like.address, owners, lockTime, threshold);
    });

    it("deploy contributor pool", async () => {
        // register by owner (acct 0)
        await like.registerContributorPool(cp.address, contributorAmount, {from: accounts[0]});
        const cpBalance = (await like.balanceOf(cp.address)).toNumber();
        assert.equal(cpBalance, contributorAmount, `${contributorAmount} units of coins should be put in cp contract`);
    });

    it("give max like coin", async () => {
        // TEST_CONT_0020
        // give max like coins to acct 3
        const amount = contributorAmount;
		await cp.proposeGive(accounts[3], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await cp.confirmProposal(proposalId, {from: accounts[2]});
		await cp.executeProposal(proposalId, {from: accounts[5]});
        giveId3.push(proposalId);
        const acctBalance = (await like.balanceOf(accounts[3])).toNumber();
        assert.equal(acctBalance, 0, "0 units of coins should be in account[3]");
        assert.equal((await cp.getRemainingLikeCoins()), 0, "Check like coins remains. (i)");
    });

    it("claim before unlock time", async () => {
        // TEST_CONT_0021
        // increase time
        await utils.testrpcIncreaseTime(testTime);
        // after 1 year
        await utils.assertSolidityThrow(async () => {
            await cp.claim(giveId3[0], {from: accounts[3]});
        }, "Should not claim like coins successfully before unlock time(after 1 year)");
        const acctBalance = (await like.balanceOf(accounts[3])).toNumber();
        assert.equal(acctBalance, 0, "0 units of coins should be in account[3]");
    });

    it("give after giving max like coin already", async () => {
        // TEST_CONT_0022
        // give 1 like coins to acct 1
        const amount = 1;
		await cp.proposeGive(accounts[3], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(proposalId, {from: accounts[5]});
        await cp.confirmProposal(proposalId, {from: accounts[4]});
        await cp.confirmProposal(proposalId, {from: accounts[2]});
        await utils.assertSolidityThrow(async () => {
			await cp.executeProposal(proposalId, {from: accounts[5]});
        }, "Should not give coins because no more available");
    });

    it("claim after unlock time", async () => {
		// TEST_CONT_0023
        // increase time
        await utils.testrpcIncreaseTime(testTime + 1);
        // after 1 year
        await cp.claim(giveId3[0], {from: accounts[3]});
        const acctBalance = (await like.balanceOf(accounts[3])).toNumber();
        assert.equal(acctBalance, contributorAmount, `${contributorAmount} units of coins should be in account[3]`);
        assert.equal((await cp.getRemainingLikeCoins()), 0, "Check like coins remains. (ii)");
    });
});

contract("ContributorPool:give3", (accounts) => {
	const owners = [1, 2, 3, 4, 5].map((i) => accounts[i]);
	const threshold = 3;
	const newOwners = [5, 6, 7, 8].map((i) => accounts[i]);
	const newThreshold = 2;
    const giveId3 = []; // acct 3
    const testTime = 86400 * 365;
    let like;
    let cp;

    before(async() => {
        like = await LikeCoin.new();
        cp = await ContributorPool.new(like.address, owners, lockTime, threshold);
    });

    it("deploy contributor pool", async () => {
        // register by owner (acct 0)
        await like.registerContributorPool(cp.address, contributorAmount, {from: accounts[0]});
        const cpBalance = (await like.balanceOf(cp.address)).toNumber();
        assert.equal(cpBalance, contributorAmount, `${contributorAmount} units of coins should be put in cp contract`);
    });

    it("claim like coin before confirm", async () => {
        // TEST_CONT_0024
        const amount = testAmount;
		await cp.proposeGive(accounts[3], amount, {from: accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        giveId3.push(proposalId);
        await utils.assertSolidityThrow(async () => {
            await cp.claim(giveId3[0], {from: accounts[3]});
        }, "Should not claim like coins successfully before confirm");
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount, "Check like coins remains. (i)");
    });

    it("claim like coin before execute", async () => {
        // TEST_CONT_0025
        await cp.confirmProposal(giveId3[0], {from: accounts[5]});
        await cp.confirmProposal(giveId3[0], {from: accounts[4]});
        await cp.confirmProposal(giveId3[0], {from: accounts[2]});
        await utils.assertSolidityThrow(async () => {
            await cp.claim(giveId3[0], {from: accounts[3]});
        }, "Should not claim like coins successfully before execute");
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount, "Check like coins remains. (ii)");
    });

    it("claim like coin after execute", async () => {
		await cp.executeProposal(giveId3[0], {from: accounts[5]});
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount - testAmount, "Check like coins remains. (iii)");
        // increase 2 year
        await utils.testrpcIncreaseTime(lockTime + 1);
		await cp.claim(giveId3[0], {from: accounts[3]});
        assert.equal((await cp.getRemainingLikeCoins()), contributorAmount - testAmount, "Check like coins remains. (iv)");
    });
});

contract("ContributorPool:setowners", (accounts) => {
	const owners = [1, 2, 3, 4, 5].map((i) => accounts[i]);
	const threshold = 3;
	const newOwners = [5, 6, 7, 8].map((i) => accounts[i]);
	const newThreshold = 2;
    const testTime = 86400 * 365;
    let like;
    let cp;
	let giveId1, giveId2, giveId3;
	let proposalId;

    before(async() => {
        like = await LikeCoin.new();
        cp = await ContributorPool.new(like.address, owners, lockTime, threshold);
    });

    it("deploy contributor pool", async () => {
        // register by owner (acct 0)
        await like.registerContributorPool(cp.address, contributorAmount, {from: accounts[0]});
        const cpBalance = (await like.balanceOf(cp.address)).toNumber();
        assert.equal(cpBalance, contributorAmount, `${contributorAmount} units of coins should be put in cp contract`);
    });

	it("propose,confirm,execute before set owner", async () => {
        const amount = testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        giveId1 = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;

		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        giveId2 = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(giveId2, {from: accounts[5]});
        await cp.confirmProposal(giveId2, {from: accounts[4]});
        await cp.confirmProposal(giveId2, {from: accounts[3]});

		await cp.proposeGive(accounts[1], amount, {from: accounts[5]});
        giveId3 = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        await cp.confirmProposal(giveId3, {from: accounts[5]});
        await cp.confirmProposal(giveId3, {from: accounts[4]});
        await cp.confirmProposal(giveId3, {from: accounts[3]});
		await cp.executeProposal(giveId3, {from: accounts[5]});
	});

	it("propose set owner", async () => {
        // TEST_CONT_0026
        await utils.assertSolidityThrow(async () => {
			// set by non owner
            await cp.proposeSetOwners(newOwners, newThreshold, {from:accounts[6]});
        }, "Should not allow proposal to set owners by non-owner");
        // TEST_CONT_0027
		// set by owner
		await cp.proposeSetOwners(newOwners, newThreshold, {from:accounts[5]});
        proposalId = (await utils.solidityEventPromise(cp.SetOwnersProposal())).args._id;
	});

	it("confirm set owner", async () => {
        // TEST_CONT_0028
        await utils.assertSolidityThrow(async () => {
			// confirm by non owner
            await cp.confirmProposal(proposalId, {from:accounts[6]});
        }, "Should not allow confirm to set owners by non-owner");
        // TEST_CONT_0029
		// confirm by owner
		await cp.confirmProposal(proposalId, {from:accounts[5]});
		await cp.confirmProposal(proposalId, {from:accounts[4]});
		await cp.confirmProposal(proposalId, {from:accounts[3]});
	});

	it("execute set owner", async () => {
        // TEST_CONT_0030
        await utils.assertSolidityThrow(async () => {
			// execute by non owner
            await cp.executeProposal(proposalId, {from:accounts[6]});
        }, "Should not allow confirm to set owners by non-owner");
        // TEST_CONT_0031
		// execute by owner
		await cp.executeProposal(proposalId, {from:accounts[5]});
	});

	it("check propose, confirm, execute after set owner", async () => {
		// TEST_CONT_0032
        await utils.assertSolidityThrow(async () => {
            await cp.confirmProposal(giveId1, {from:accounts[6]});
        }, "Should not confirm the void proposal after set owner");
        await utils.assertSolidityThrow(async () => {
            await cp.confirmProposal(giveId1, {from:accounts[5]});
        }, "Should not confirm the void proposal after set owner 2");

		// TEST_CONT_0033
        await utils.assertSolidityThrow(async () => {
            await cp.executeProposal(giveId2, {from:accounts[6]});
        }, "Should not execute the void proposal after set owner");
        await utils.assertSolidityThrow(async () => {
            await cp.executeProposal(giveId2, {from:accounts[5]});
        }, "Should not execute the void proposal after set owner 2");

		// TEST_CONT_0034
        await utils.testrpcIncreaseTime(lockTime + 1);
		await cp.claim(giveId3, {from:accounts[1]});
        const acctBalance = (await like.balanceOf(accounts[1])).toNumber();
        assert.equal(acctBalance, testAmount, `${testAmount} units of coins should be in account[1]`);
	});
});

contract("ContributorEvent", (accounts) => {
	const owners = [1, 2, 3, 4, 5].map((i) => accounts[i]);
	const threshold = 3;
	const newOwners = [5, 6, 7, 8].map((i) => accounts[i]);
	const newThreshold = 2;
    const giveId1 = []; // acct 1
    let like;
    let cp;

    before(async() => {
        like = await LikeCoin.new();
        cp = await ContributorPool.new(like.address, owners, lockTime, threshold);
    });

    it("should emit Transfer event, from like contract to contributorpool contract", async () => {
		// TEST_CONT_0035
        // register by owner (acct 0)
        await like.registerContributorPool(cp.address, contributorAmount, {from: accounts[0]});
        const event = await utils.solidityEventPromise(like.Transfer());
        assert.equal(event.args._from, 0x0, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, cp.address, "Transfer event has wrong value on field '_to'");
        assert.equal(event.args._value, contributorAmount, "Transfer event has wrong value on field '_value'");
    });

	it("should emit Set owners event", async () => {
		// TEST_CONT_0036
		await cp.proposeSetOwners(newOwners, newThreshold, {from:accounts[5]});
        const proposalId = (await utils.solidityEventPromise(cp.SetOwnersProposal())).args._id;
        let event = await utils.solidityEventPromise(cp.SetOwnersProposal());
        assert.equal(event.args._id.toNumber(), proposalId, "SetOwnersProposal event has wrong value on field '_id'");
        assert.equal(event.args._proposer, accounts[5], "SetOwnersProposal event has wrong value on field '_proposer'");
		for (let i = 0; i < newOwners.length; i++) {
			assert.equal(event.args._newOwners[i], newOwners[i], `SetOwnersProposal event has wrong value on field _newOwners[${i}]`);
		}
        assert.equal(event.args._newThreshold, newThreshold, "SetOwnersProposal event has wrong value on field '_newThreshold'");
		
		await cp.confirmProposal(proposalId, {from:accounts[5]});
		event = await utils.solidityEventPromise(cp.ProposalConfirmation());
        assert.equal(event.args._id.toNumber(), proposalId, "ProposalConfirmation event has wrong value on field '_id'");
        assert.equal(event.args._confirmer, accounts[5], "ProposalConfirmation event has wrong value on field '_confirmer'");
		await cp.confirmProposal(proposalId, {from:accounts[4]});
		event = await utils.solidityEventPromise(cp.ProposalConfirmation());
        assert.equal(event.args._id.toNumber(), proposalId, "ProposalConfirmation event has wrong value on field '_id'");
        assert.equal(event.args._confirmer, accounts[4], "ProposalConfirmation event has wrong value on field '_confirmer'");
		await cp.confirmProposal(proposalId, {from:accounts[3]});
		event = await utils.solidityEventPromise(cp.ProposalConfirmation());
        assert.equal(event.args._id.toNumber(), proposalId, "ProposalConfirmation event has wrong value on field '_id'");
        assert.equal(event.args._confirmer, accounts[3], "ProposalConfirmation event has wrong value on field '_confirmer'");

		await cp.executeProposal(proposalId, {from:accounts[5]});
		event = await utils.solidityEventPromise(cp.ProposalExecution());
        assert.equal(event.args._id.toNumber(), proposalId, "ProposalExecution event has wrong value on field '_id'");
        assert.equal(event.args._executer, accounts[5], "ProposalExecution event has wrong value on field '_executer'");
	});

    it("should emit Give event, from contributorpool contract to account", async () => {
		// TEST_CONT_0037
        // give like coins to acct 1
        const amount = testAmount;
		await cp.proposeGive(accounts[1], amount, {from: accounts[6]});
        const proposalId = (await utils.solidityEventPromise(cp.GiveProposal())).args._id;
        let event = await utils.solidityEventPromise(cp.GiveProposal());
        assert.equal(event.args._id.toNumber(), proposalId, "Give Proposal event has wrong value on field '_id'");
        assert.equal(event.args._proposer, accounts[6], "Give Proposal event has wrong value on field '_proposer'");
        assert.equal(event.args._to, accounts[1], "Give Proposal event has wrong value on field '_to'");
        assert.equal(event.args._value, amount, "Give Proposal event has wrong value on field '_value'");

        await cp.confirmProposal(proposalId, {from: accounts[6]});
		event = await utils.solidityEventPromise(cp.ProposalConfirmation());
        assert.equal(event.args._id.toNumber(), proposalId, "ProposalConfirmation event has wrong value on field '_id'");
        assert.equal(event.args._confirmer, accounts[6], "ProposalConfirmation event has wrong value on field '_confirmer'");
        await cp.confirmProposal(proposalId, {from: accounts[7]});
		event = await utils.solidityEventPromise(cp.ProposalConfirmation());
        assert.equal(event.args._id.toNumber(), proposalId, "ProposalConfirmation event has wrong value on field '_id'");
        assert.equal(event.args._confirmer, accounts[7], "ProposalConfirmation event has wrong value on field '_confirmer'");

		await cp.executeProposal(proposalId, {from: accounts[6]});
		event = await utils.solidityEventPromise(cp.ProposalExecution());
        assert.equal(event.args._id.toNumber(), proposalId, "ProposalExecution event has wrong value on field '_id'");
        assert.equal(event.args._executer, accounts[6], "ProposalExecution event has wrong value on field '_executer'");
		giveId1.push(proposalId);
    });

    // event transfer likecoin from contributorpool contract to account
    it("should emit Transfer event, from contributorpool contract to account", async () => {
		// TEST_CONT_0038
        // increase time
        await utils.testrpcIncreaseTime(lockTime + 1);
        // acct 1 claims after 2 years
        await cp.claim(giveId1[0], {from: accounts[1]});
        let event = await utils.solidityEventPromise(like.Transfer());
        assert.equal(event.args._from, cp.address, "Transfer event has wrong value on field '_from'");
        assert.equal(event.args._to, accounts[1], "Transfer event has wrong value on field '_to'");
        assert.equal(event.args._value, testAmount, "Transfer event has wrong value on field '_value'");

		event = await utils.solidityEventPromise(cp.Claimed());
		assert.equal(event.args._id.toNumber(), giveId1[0], "Claimed event has wrong value on field '_id'");
    });
});
