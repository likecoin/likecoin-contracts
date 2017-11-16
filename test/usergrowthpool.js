/* eslint-env mocha, node */
/* global artifacts, contract, assert, web3 */

const utils = require("./utils.js");
const BigNumber = require("bignumber.js");
const LikeCoin = artifacts.require("./LikeCoin.sol");
const UserGrowthPool = artifacts.require("./UserGrowthPool.sol");

const decimalFactor = new BigNumber(10).pow(18);

function coinsToCoinUnits(value) {
    return decimalFactor.times(value);
}

const mintGap = 60 * 60 * 24 * 365;
const mintValues = {
    0: coinsToCoinUnits(200000000),
    1: coinsToCoinUnits(100000000),
    2: coinsToCoinUnits(90000000),
    3: coinsToCoinUnits(80000000),
    4: coinsToCoinUnits(70000000),
    5: coinsToCoinUnits(60000000),
    6: coinsToCoinUnits(50000000),
    7: coinsToCoinUnits(40000000),
    8: coinsToCoinUnits(30000000),
    9: coinsToCoinUnits(20000000),
    10: coinsToCoinUnits(10000000),
};

contract("LikeCoin User Growth Pools", (accounts) => {
    let like;
    const mintTimes = [];
    const pools = [];
    const threshold = 3;
    const owners = [1, 2, 3, 4, 5].map((i) => accounts[i]);
    const newOwners = [5, 6, 7, 8].map((i) => accounts[i]);
    const newThreshold = 2;

    const unconfirmedPendingProposals = [];
    const confirmedPendingProposals = [];

    before(async () => {
        // The blocktime of next block could be affected by snapshot and revert, so mine the next block immediately by
        // calling testrpcIncreaseTime
        await utils.testrpcIncreaseTime(1);
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        const start = now + 1000;
        like = await LikeCoin.new(0, 0);
        for (let i of Object.keys(mintValues)) {
            const mintTime = start + i * mintGap;
            mintTimes.push(mintTime);
            const pool = await UserGrowthPool.new(like.address, owners, threshold, mintTime, mintValues[i]);
            pools.push(pool);
        }
    });

    it("should deploy the UserGrowthPool contracts correctly", async () => {
        for (let i of Object.keys(mintValues)) {
            const pool = pools[i];
            const ownersCount = (await pool.ownersCount()).toNumber();
            assert.equal(ownersCount, owners.length, `pools[${i}] has wrong number of owners`);
            for (let j = 0; j < ownersCount; j++) {
                assert.equal(await pool.owners(j), owners[j], `pools[${i}] has wrong owner at index ${j}`);
            }
            assert.equal((await pool.threshold()).toNumber(), threshold, `pools[${i}] has wrong threshold`);
            assert.equal((await pool.mintTime()).toNumber(), mintTimes[i], `pools[${i}] has wrong mintTime`);
            assert((await pool.mintValue()).eq(mintValues[i]), `pools[${i}] has wrong mintValue`);
        }
    });

    it("should forbid invalid number of owners and threshold values when deploying", async () => {
        await utils.assertSolidityThrow(async () => {
            await UserGrowthPool.new(like.address, [], 0, mintTimes[0], mintValues[0]);
        }, "should forbid deploying UserGrowthPool contract with no owners");
        await utils.assertSolidityThrow(async () => {
            await UserGrowthPool.new(like.address, [accounts[0], accounts[1]], 3, mintTimes[0], mintValues[0]);
        }, "should forbid deploying UserGrowthPool contract with threshold value larger than number of owners");
        await utils.assertSolidityThrow(async () => {
            await UserGrowthPool.new(like.address, [accounts[0], accounts[1]], 0, mintTimes[0], mintValues[0]);
        }, "should forbid deploying UserGrowthPool contract with threshold value 0");
        await UserGrowthPool.new(like.address, [accounts[0], accounts[1]], 2, mintTimes[0], mintValues[0]);
        await UserGrowthPool.new(like.address, [accounts[0], accounts[1]], 1, mintTimes[0], mintValues[0]);
    });

    it("should forbid non-owner to register UserGrowthPools", async () => {
        await utils.assertSolidityThrow(async () => {
            await like.registerUserGrowthPools(pools.map((pool) => pool.address), {from: accounts[1]});
        }, "should forbid accounts[1] to register UserGrowthPools");
    });

    it("should forbid register UserGrowthPools more than once", async () => {
        await like.registerUserGrowthPools(pools.map((pool) => pool.address));
        await utils.assertSolidityThrow(async () => {
            await like.registerUserGrowthPools([accounts[0]]);
        }, "should forbid register UserGrowthPools more than once");
    });

    it("should forbid minting before mintTime", async () => {
        const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
        await utils.testrpcIncreaseTime(mintTimes[3] + 10 - now);
        for (let i = 4; i < Object.keys(mintValues).length; i++) {
            const pool = pools[i];
            const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
            assert.isBelow(now, (await pool.mintTime()).toNumber(), `Blocktime is already after mintTime of pools[${i}], please adjust test case`);
            await utils.assertSolidityThrow(async () => {
                await pool.mint({from: accounts[1]});
            }, `Should not allow minting pools[${i}] before mintTime`);
        }
    });

    it("should mint correct amount of coins", async () => {
        const supply1 = await like.totalSupply();
        assert.equal((await like.balanceOf(pools[0].address)).toNumber(), 0, "pools[0] should not own any coins before minting");
        await pools[0].mint();
        const supply2 = await like.totalSupply();
        assert(supply2.sub(supply1).eq(mintValues[0]), "Minted wrong amount of coins for pools[0]");
        const pool0Balance = await like.balanceOf(pools[0].address);
        assert(pool0Balance.eq(mintValues[0]), "pools[0] owned wrong amount of coins after minting");
        assert.equal((await like.balanceOf(pools[1].address)).toNumber(), 0, "pools[1] should not own any coins before minting");
        await pools[1].mint();
        const supply3 = await like.totalSupply();
        const pool1Balance = await like.balanceOf(pools[1].address);
        assert(supply3.sub(supply2).eq(mintValues[1]), "Minted wrong amount of coins for pools[1]");
        assert(pool1Balance.eq(mintValues[1]), "pools[1] owned wrong amount of coins after minting");
    });

    it("should forbid unregistered address to mint coins", async () => {
        await utils.assertSolidityThrow(async () => {
            await like.mintForUserGrowthPool(10000);
        }, "Minting from unregistered address should be forbidden");
    });

    it("should forbid minting more than once", async () => {
        await utils.assertSolidityThrow(async () => {
            await pools[0].mint();
        },"Should forbid minting more than once");
    });

    it("should allow transfer with confirmations", async () => {
        const poolBalanceBefore = await like.balanceOf(pools[0].address);
        const accountBalanceBefore = await like.balanceOf(accounts[1]);
        const value = 123456789;
        await pools[0].proposeTransfer(accounts[1], value, {from: accounts[1]});
        const transferProposal = await utils.solidityEventPromise(pools[0].TransferProposal());
        const proposalId = transferProposal.args._id;
        assert.equal(transferProposal.args._proposer, accounts[1], "Wrong proposer address in TransferProposal event");
        assert.equal(transferProposal.args._to, accounts[1], "Wrong to-address in TransferProposal event");
        assert(transferProposal.args._value.eq(value), "Wrong value in TransferProposal event");
        const signers = [1, 2, 5];
        for (let i = 0; i < threshold; i++) {
            await pools[0].confirmProposal(proposalId, {from: accounts[signers[i]]});
            const confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
            assert(confirm.args._id.eq(proposalId), "Wrong proposal ID in confirm event");
            assert.equal(confirm.args._confirmer, accounts[signers[i]], "Wrong confirmer address in confirm event");
        }
        await pools[0].executeProposal(proposalId, {from: accounts[1]});
        const execution = await utils.solidityEventPromise(pools[0].ProposalExecution());
        assert(execution.args._id.eq(proposalId), "Wrong proposal ID in execution event");
        assert.equal(execution.args._executer, accounts[1], "Wrong proposal ID in execution event");
        const poolBalanceAfter = await like.balanceOf(pools[0].address);
        const accountBalanceAfter = await like.balanceOf(accounts[1]);
        assert(poolBalanceBefore.sub(poolBalanceAfter).eq(value), "pools[0] owned wrong amount of coins after transfer");
        assert(accountBalanceAfter.sub(accountBalanceBefore).eq(value), "accounts[1] owned wrong amount of coins after transfer");
    });

    it("should forbid executing transfer proposal without enough confirmations", async () => {
        const value = 234567890;
        await pools[0].proposeTransfer(accounts[1], value, {from: accounts[1]});
        const proposalId = (await utils.solidityEventPromise(pools[0].TransferProposal())).args._id;

        await pools[0].confirmProposal(proposalId, {from: accounts[2]});
        await utils.assertSolidityThrow(async () => {
            await pools[0].executeProposal(proposalId, {from: accounts[1]});
        }, "should forbid executing transfer proposal with only 1 confirmation");

        await pools[0].confirmProposal(proposalId, {from: accounts[3]});
        await utils.assertSolidityThrow(async () => {
            await pools[0].executeProposal(proposalId, {from: accounts[1]});
        }, "should forbid executing transfer proposal with only 2 confirmation");
        unconfirmedPendingProposals.push(proposalId);
    });

    it("should allow multiple proposals to run in parallel", async () => {
        const poolBalanceBefore = await like.balanceOf(pools[0].address);
        const accountBalanceBefore = await like.balanceOf(accounts[1]);

        const value1 = 345678901;
        const value2 = 456789012;
        const value3 = 567890123;

        await pools[0].proposeTransfer(accounts[1], value1, {from: accounts[2]});
        const proposalId1 = (await utils.solidityEventPromise(pools[0].TransferProposal())).args._id;

        await pools[0].proposeTransfer(accounts[1], value2, {from: accounts[3]});
        const proposalId2 = (await utils.solidityEventPromise(pools[0].TransferProposal())).args._id;
        assert(!proposalId1.eq(proposalId2), "Two proposals have the same ID");

        await pools[0].proposeTransfer(accounts[1], value3, {from: accounts[4]});
        const proposalId3 = (await utils.solidityEventPromise(pools[0].TransferProposal())).args._id;
        assert(!proposalId1.eq(proposalId3), "Two proposals have the same ID");
        assert(!proposalId2.eq(proposalId3), "Two proposals have the same ID");

        let confirm;
        let execution;

        await pools[0].confirmProposal(proposalId1, {from: accounts[1]});
        confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
        assert.equal(confirm.args._confirmer, accounts[1], "Wrong confirmer address in confirm event");
        assert(confirm.args._id.eq(proposalId1), "Wrong proposal ID in confirm event");

        await pools[0].confirmProposal(proposalId2, {from: accounts[2]});
        confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
        assert.equal(confirm.args._confirmer, accounts[2], "Wrong confirmer address in confirm event");
        assert(confirm.args._id.eq(proposalId2), "Wrong proposal ID in confirm event");

        await pools[0].confirmProposal(proposalId3, {from: accounts[3]});
        confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
        assert.equal(confirm.args._confirmer, accounts[3], "Wrong confirmer address in confirm event");
        assert(confirm.args._id.eq(proposalId3), "Wrong proposal ID in confirm event");

        // Out of order
        await pools[0].confirmProposal(proposalId2, {from: accounts[3]});
        confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
        assert.equal(confirm.args._confirmer, accounts[3], "Wrong confirmer address in confirm event");
        assert(confirm.args._id.eq(proposalId2), "Wrong proposal ID in confirm event");

        await pools[0].confirmProposal(proposalId3, {from: accounts[4]});
        confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
        assert.equal(confirm.args._confirmer, accounts[4], "Wrong confirmer address in confirm event");
        assert(confirm.args._id.eq(proposalId3), "Wrong proposal ID in confirm event");

        await pools[0].confirmProposal(proposalId1, {from: accounts[2]});
        confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
        assert.equal(confirm.args._confirmer, accounts[2], "Wrong confirmer address in confirm event");
        assert(confirm.args._id.eq(proposalId1), "Wrong proposal ID in confirm event");

        // Out of order
        await pools[0].confirmProposal(proposalId3, {from: accounts[5]});
        confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
        assert.equal(confirm.args._confirmer, accounts[5], "Wrong confirmer address in confirm event");
        assert(confirm.args._id.eq(proposalId3), "Wrong proposal ID in confirm event");

        await pools[0].confirmProposal(proposalId1, {from: accounts[3]});
        confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
        assert.equal(confirm.args._confirmer, accounts[3], "Wrong confirmer address in confirm event");
        assert(confirm.args._id.eq(proposalId1), "Wrong proposal ID in confirm event");

        await pools[0].confirmProposal(proposalId2, {from: accounts[4]});
        confirm = await utils.solidityEventPromise(pools[0].ProposalConfirmation());
        assert.equal(confirm.args._confirmer, accounts[4], "Wrong confirmer address in confirm event");
        assert(confirm.args._id.eq(proposalId2), "Wrong proposal ID in confirm event");

        await pools[0].executeProposal(proposalId3, {from: accounts[5]});
        execution = await utils.solidityEventPromise(pools[0].ProposalExecution());
        assert(execution.args._id.eq(proposalId3), "Wrong proposal ID in execution event");
        const poolBalanceAfter3 = await like.balanceOf(pools[0].address);
        const accountBalanceAfter3 = await like.balanceOf(accounts[1]);
        assert(poolBalanceAfter3.eq(poolBalanceBefore.sub(value3)), "pools[0] owned wrong amount of coins after executing proposal 3");
        assert(accountBalanceAfter3.eq(accountBalanceBefore.add(value3)), "accounts[1] owned wrong amount of coins after executing proposal 3");

        await pools[0].executeProposal(proposalId1, {from: accounts[3]});
        execution = await utils.solidityEventPromise(pools[0].ProposalExecution());
        assert(execution.args._id.eq(proposalId1), "Wrong proposal ID in execution event");
        const poolBalanceAfter1 = await like.balanceOf(pools[0].address);
        const accountBalanceAfter1 = await like.balanceOf(accounts[1]);
        assert(poolBalanceAfter1.eq(poolBalanceAfter3.sub(value1)), "pools[0] owned wrong amount of coins after executing proposal 1");
        assert(accountBalanceAfter1.eq(accountBalanceAfter3.add(value1)), "accounts[1] owned wrong amount of coins after executing proposal 1");

        await pools[0].executeProposal(proposalId2, {from: accounts[4]});
        execution = await utils.solidityEventPromise(pools[0].ProposalExecution());
        assert(execution.args._id.eq(proposalId2), "Wrong proposal ID in execution event");
        const poolBalanceAfter2 = await like.balanceOf(pools[0].address);
        const accountBalanceAfter2 = await like.balanceOf(accounts[1]);
        assert(poolBalanceAfter2.eq(poolBalanceAfter1.sub(value2)), "pools[0] owned wrong amount of coins after executing proposal 2");
        assert(accountBalanceAfter2.eq(accountBalanceAfter1.add(value2)), "accounts[1] owned wrong amount of coins after executing proposal 2");
    });

    it("should forbid non-owners to participate in transfer proposal", async () => {
        const value = 678901234;
        await utils.assertSolidityThrow(async () => {
            await pools[0].proposeTransfer(accounts[1], value, {from: accounts[6]});
        }, "should forbid non-owner to propose transfer proposal");

        await pools[0].proposeTransfer(accounts[1], value, {from: accounts[1]});
        const proposalId = (await utils.solidityEventPromise(pools[0].TransferProposal())).args._id;

        await utils.assertSolidityThrow(async () => {
            await pools[0].confirmProposal(proposalId, {from: accounts[7]});
        }, "should forbid non-owner to confirm transfer proposal");

        await pools[0].confirmProposal(proposalId, {from: accounts[1]});
        await pools[0].confirmProposal(proposalId, {from: accounts[2]});
        await pools[0].confirmProposal(proposalId, {from: accounts[3]});

        await utils.assertSolidityThrow(async () => {
            await pools[0].executeProposal(proposalId, {from: accounts[8]});
        }, "should forbid non-owner to execute transfer proposal");
        confirmedPendingProposals.push(proposalId);
    });

    it("should forbid duplicated confirmation from the same confirmer", async () => {
        const value = 789012345;
        await pools[0].proposeTransfer(accounts[1], value, {from: accounts[1]});
        const proposalId = (await utils.solidityEventPromise(pools[0].TransferProposal())).args._id;
        await pools[0].confirmProposal(proposalId, {from: accounts[1]});
        await utils.assertSolidityThrow(async () => {
            await pools[0].confirmProposal(proposalId, {from: accounts[1]});
        }, "should forbid owners to confirm the same proposal more than once");
        unconfirmedPendingProposals.push(proposalId);
    });

    it("should forbid duplicated execution of TransferProposal", async () => {
        const value = 890123456;
        await pools[0].proposeTransfer(accounts[1], value, {from: accounts[1]});
        const proposalId = (await utils.solidityEventPromise(pools[0].TransferProposal())).args._id;
        await pools[0].confirmProposal(proposalId, {from: accounts[1]});
        await pools[0].confirmProposal(proposalId, {from: accounts[2]});
        await pools[0].confirmProposal(proposalId, {from: accounts[3]});
        await pools[0].executeProposal(proposalId, {from: accounts[1]});
        await utils.assertSolidityThrow(async () => {
            await pools[0].executeProposal(proposalId, {from: accounts[2]});
        }, "should forbid executing the same proposal more than once");
    });

    it("should forbid confirming TransferProposal more than required", async () => {
        const value = 901234567;
        await pools[0].proposeTransfer(accounts[1], value, {from: accounts[1]});
        const proposalId = (await utils.solidityEventPromise(pools[0].TransferProposal())).args._id;
        await pools[0].confirmProposal(proposalId, {from: accounts[2]});
        await pools[0].confirmProposal(proposalId, {from: accounts[3]});
        await pools[0].confirmProposal(proposalId, {from: accounts[4]});
        await utils.assertSolidityThrow(async () => {
            await pools[0].confirmProposal(proposalId, {from: accounts[5]});
        }, "should forbid confirming TransferProposal more than required");
        await pools[0].executeProposal(proposalId, {from: accounts[1]});
    });

    let executedSetOwnersProposalId;
    it("should allow set owners with confirmations", async () => {
        await pools[0].proposeSetOwners(newOwners, newThreshold, {from: accounts[1]});
        const setOwnersProposal = await utils.solidityEventPromise(pools[0].SetOwnersProposal());
        const proposalId = setOwnersProposal.args._id;
        assert.equal(setOwnersProposal.args._proposer, accounts[1], "Wrong proposer address in SetOwnersProposal event");
        const _newOwners = setOwnersProposal.args._newOwners;
        assert.deepEqual(_newOwners, newOwners, "Wrong newOwners in SetOwnersProposal event");
        assert.equal(setOwnersProposal.args._newThreshold.toNumber(), newThreshold, "Wrong newThreshold in SetOwnersProposal event");
        await pools[0].confirmProposal(proposalId, {from: accounts[1]});
        await pools[0].confirmProposal(proposalId, {from: accounts[2]});
        await pools[0].confirmProposal(proposalId, {from: accounts[3]});
        await pools[0].executeProposal(proposalId, {from: accounts[1]});
        const execution = await utils.solidityEventPromise(pools[0].ProposalExecution());
        assert(execution.args._id.eq(proposalId), "Wrong proposal ID in execution event");
        const ownersCount = (await pools[0].ownersCount()).toNumber();
        assert.equal(ownersCount, newOwners.length, "pools[0] has wrong number of owners after executing SetOwnersProposal");
        for (let i = 0; i < ownersCount; i++) {
            assert.equal(await pools[0].owners(i), newOwners[i], `pools[0] has wrong owner at index ${i} after executing SetOwnersProposal`);
        }
        assert.equal((await pools[0].threshold()).toNumber(), newThreshold, "pools[0] has wrong threshold after executing SetOwnersProposal");
        executedSetOwnersProposalId = proposalId;
    });

    it("should void old owners", async () => {
        for (let i = 1; i <= 4; i++) {
            await utils.assertSolidityThrow(async () => {
                await pools[0].proposeTransfer(accounts[1], 123456789, {from: accounts[i]});
            }, `should not allow old owner accounts[${i}] to propose TransferProposal`);
            await utils.assertSolidityThrow(async () => {
                await pools[0].proposeSetOwners(newOwners, newThreshold, {from: accounts[i]});
            }, `should not allow old owner accounts[${i}] to propose SetOwnersProposal`);
        }
    });

    it("should void all pending proposals after set owners", async () => {
        for (let i = 0; i < unconfirmedPendingProposals.length; i++) {
            await utils.assertSolidityThrow(async () => {
                await pools[0].confirmProposal(unconfirmedPendingProposals[i], {from: accounts[5]});
            }, "should not allow confirming old proposals");
        }
        for (let i = 0; i < confirmedPendingProposals.length; i++) {
            await utils.assertSolidityThrow(async () => {
                await pools[0].executeProposal(confirmedPendingProposals[i], {from: accounts[5]});
            }, "should not allow executing old proposals");
        }
    });

    it("should not allow executing set owners without enough confirm", async () => {
        await pools[0].proposeSetOwners(newOwners, newThreshold, {from: accounts[5]});
        const setOwnersProposal = await utils.solidityEventPromise(pools[0].SetOwnersProposal());
        const proposalId = setOwnersProposal.args._id;
        await utils.assertSolidityThrow(async () => {
            await pools[0].executeProposal(proposalId, {from: accounts[5]});
        }, "should not allow executing unconfirmed SetOwnersProposal");
        await pools[0].confirmProposal(proposalId, {from: accounts[5]});
        await utils.assertSolidityThrow(async () => {
            await pools[0].executeProposal(proposalId, {from: accounts[5]});
        }, "should not allow executing unconfirmed SetOwnersProposal");
    });

    it("should forbid non-owners to participate in set owner proposal", async () => {
        await utils.assertSolidityThrow(async () => {
            await pools[0].proposeSetOwners(newOwners, newThreshold, {from: accounts[9]});
        }, "should not allow non-owner to propose SetOwnersProposal");

        await pools[0].proposeSetOwners(newOwners, newThreshold, {from: accounts[5]});
        const setOwnersProposal = await utils.solidityEventPromise(pools[0].SetOwnersProposal());
        const proposalId = setOwnersProposal.args._id;

        await utils.assertSolidityThrow(async () => {
            await pools[0].confirmProposal(proposalId, {from: accounts[9]});
        }, "should not allow non-owner to confirm SetOwnersProposal");

        await pools[0].confirmProposal(proposalId, {from: accounts[5]});
        await pools[0].confirmProposal(proposalId, {from: accounts[6]});

        await utils.assertSolidityThrow(async () => {
            await pools[0].executeProposal(proposalId, {from: accounts[9]});
        }, "should not allow non-owner to execute SetOwnersProposal");
    });

    it("should forbid duplicated execution of SetOwnersProposal", async () => {
        await utils.assertSolidityThrow(async () => {
            await pools[0].executeProposal(executedSetOwnersProposalId, {from: accounts[5]});
        }, "should forbid executing the same proposal more than once");
    });


    it("should forbid confirming SetOwnersProposal more than required", async () => {
        await pools[0].proposeSetOwners(newOwners, newThreshold, {from: accounts[5]});
        const setOwnersProposal = await utils.solidityEventPromise(pools[0].SetOwnersProposal());
        const proposalId = setOwnersProposal.args._id;
        await pools[0].confirmProposal(proposalId, {from: accounts[6]});
        await pools[0].confirmProposal(proposalId, {from: accounts[7]});
        await utils.assertSolidityThrow(async () => {
            await pools[0].confirmProposal(proposalId, {from: accounts[8]});
        }, "should forbid confirming SetOwnersProposal more than required");
        await pools[0].executeProposal(proposalId, {from: accounts[5]});
    });

    it("should forbid invalid number of owners and threshold values when proposing SetOwnersProposal", async () => {
        await utils.assertSolidityThrow(async () => {
            await pools[0].proposeSetOwners([], 0, {from: accounts[5]});
        }, "should forbid proposing setOwnersProposal with no owners");
        await utils.assertSolidityThrow(async () => {
            await pools[0].proposeSetOwners([accounts[0], accounts[1]], 3, {from: accounts[5]});
        }, "should forbid proposing setOwnersProposal with threshold value larger than number of owners");
        await utils.assertSolidityThrow(async () => {
            await pools[0].proposeSetOwners([accounts[0], accounts[1]], 0, {from: accounts[5]});
        }, "should forbid proposing setOwnersProposal with threshold value 0");
        await pools[0].proposeSetOwners([accounts[0], accounts[1]], 2, {from: accounts[5]});
        await pools[0].proposeSetOwners([accounts[0], accounts[1]], 1, {from: accounts[5]});
    });
});
