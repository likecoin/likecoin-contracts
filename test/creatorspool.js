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
/* eslint no-underscore-dangle: off */
/* eslint no-await-in-loop: off */
/* global artifacts, contract, assert, web3 */

const utils = require('./utils.js');
const BigNumber = require('bignumber.js');

const LikeCoin = artifacts.require('./LikeCoin.sol');
const CreatorsPool = artifacts.require('./CreatorsPool.sol');

const { coinsToCoinUnits } = utils;

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

contract('LikeCoin Creators Pools', (accounts) => {
  let like;
  const mintTimes = [];
  let mintLimit = coinsToCoinUnits(0);
  const pools = [];
  const poolAddrs = [];
  const threshold = 3;
  const owners = [1, 2, 3, 4, 5].map(i => accounts[i]);
  const newOwners = [5, 6, 7, 8].map(i => accounts[i]);
  const newThreshold = 2;

  const unconfirmedPendingProposals = [];
  const confirmedPendingProposals = [];

  before(async () => {
    // The blocktime of next block could be affected by snapshot and revert, so mine the next block
    // immediately by calling testrpcIncreaseTime
    await utils.testrpcIncreaseTime(1);
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    const start = now + 1000;
    like = await LikeCoin.new(0, 0x0, 0x0);
    const keys = Object.keys(mintValues);
    for (let k = 0; k < keys.length; k += 1) {
      const i = keys[k];
      const mintTime = start + (i * mintGap);
      mintTimes.push(mintTime);
      mintLimit = mintLimit.add(mintValues[i]);
      const pool =
        await CreatorsPool.new(like.address, owners, threshold, mintTime, mintValues[i]);
      pools.push(pool);
      poolAddrs.push(pool.address);
    }
  });

  it('should deploy the CreatorsPool contracts correctly', async () => {
    const keys = Object.keys(mintValues);
    for (let k = 0; k < keys.length; k += 1) {
      const i = keys[k];
      const pool = pools[i];
      const ownersCount = (await pool.ownersCount()).toNumber();
      assert.equal(ownersCount, owners.length, `pools[${i}] has wrong number of owners`);
      for (let j = 0; j < ownersCount; j += 1) {
        assert.equal(await pool.owners(j), owners[j], `pools[${i}] has wrong owner at index ${j}`);
      }

      assert.equal((await pool.threshold()).toNumber(), threshold, `pools[${i}] has wrong threshold`);
      assert.equal((await pool.mintTime()).toNumber(), mintTimes[i], `pools[${i}] has wrong mintTime`);
      assert((await pool.mintValue()).eq(mintValues[i]), `pools[${i}] has wrong mintValue`);
    }
  });

  it('should forbid invalid number of owners and threshold values when deploying', async () => {
    await utils.assertSolidityThrow(async () => {
      await CreatorsPool.new(like.address, [], 0, mintTimes[0], mintValues[0]);
    }, 'should forbid deploying CreatorsPool contract with no owners');

    await utils.assertSolidityThrow(async () => {
      await CreatorsPool.new(
        like.address, [accounts[0], accounts[1]],
        3, mintTimes[0], mintValues[0],
      );
    }, 'should forbid deploying CreatorsPool contract with threshold value larger than number of owners');

    await utils.assertSolidityThrow(async () => {
      await CreatorsPool.new(
        like.address, [accounts[0], accounts[1]],
        0, mintTimes[0], mintValues[0],
      );
    }, 'should forbid deploying CreatorsPool contract with threshold value 0');

    await CreatorsPool.new(
      like.address, [accounts[0], accounts[1]],
      2, mintTimes[0], mintValues[0],
    );
    await CreatorsPool.new(
      like.address, [accounts[0], accounts[1]],
      1, mintTimes[0], mintValues[0],
    );

    await utils.assertSolidityThrow(async () => {
      await CreatorsPool.new(
        like.address, [accounts[0], accounts[0]],
        2, mintTimes[0], mintValues[0],
      );
    }, 'should forbid duplicated addresses in owners');
  });

  it('should forbid non-owner to register CreatorsPools', async () => {
    await utils.assertSolidityThrow(async () => {
      await like.registerCreatorsPools(poolAddrs, mintLimit, { from: accounts[1] });
    }, 'should forbid accounts[1] to register CreatorsPools');
    await like.transferOwnership(accounts[1], { from: accounts[0] });
    await utils.assertSolidityThrow(async () => {
      await like.registerCreatorsPools(poolAddrs, mintLimit, { from: accounts[1] });
    }, 'should forbid pending owner accounts[1] to register CreatorsPools');

    await like.claimOwnership({ from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await like.registerCreatorsPools(poolAddrs, mintLimit, { from: accounts[0] });
    }, 'should forbid old owner accounts[0] to register CreatorsPools');
    // change back
    await like.transferOwnership(accounts[0], { from: accounts[1] });
    await like.claimOwnership({ from: accounts[0] });
  });

  it('should forbid register CreatorsPools more than once', async () => {
    await like.registerCreatorsPools(poolAddrs, mintLimit);
    await utils.assertSolidityThrow(async () => {
      await like.registerCreatorsPools([accounts[0]], mintLimit);
    }, 'should forbid register CreatorsPools more than once');
  });

  it('should forbid minting before mintTime', async () => {
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    await utils.testrpcIncreaseTime((mintTimes[3] - now) + 1);
    for (let i = 4; i < Object.keys(mintValues).length; i += 1) {
      const pool = pools[i];
      const t = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
      assert.isBelow(t, (await pool.mintTime()).toNumber(), `Blocktime is already after mintTime of pools[${i}], please adjust test case`);
      await utils.assertSolidityThrow(async () => {
        await pool.mint();
      }, `Should not allow minting pools[${i}] before mintTime`);
    }
  });

  it('should mint correct amount of coins', async () => {
    const supply1 = await like.totalSupply();
    assert.equal((await like.balanceOf(pools[0].address)).toNumber(), 0, 'pools[0] should not own any coins before minting');
    await pools[0].mint();
    const supply2 = await like.totalSupply();
    assert(supply2.sub(supply1).eq(mintValues[0]), 'Minted wrong amount of coins for pools[0]');
    const pool0Balance = await like.balanceOf(pools[0].address);
    assert(pool0Balance.eq(mintValues[0]), 'pools[0] owned wrong amount of coins after minting');

    assert.equal((await like.balanceOf(pools[1].address)).toNumber(), 0, 'pools[1] should not own any coins before minting');
    await pools[1].mint();
    const supply3 = await like.totalSupply();
    const pool1Balance = await like.balanceOf(pools[1].address);
    assert(supply3.sub(supply2).eq(mintValues[1]), 'Minted wrong amount of coins for pools[1]');
    assert(pool1Balance.eq(mintValues[1]), 'pools[1] owned wrong amount of coins after minting');
  });

  it('should forbid unregistered address to mint coins', async () => {
    await utils.assertSolidityThrow(async () => {
      await like.mintForCreatorsPool(10000);
    }, 'Minting from unregistered address should be forbidden');
  });

  it('should allow transfer with confirmations', async () => {
    const poolBalanceBefore = await like.balanceOf(pools[0].address);
    const accountBalanceBefore = await like.balanceOf(accounts[1]);
    const value = 123456789;
    let callResult = await pools[0].proposeTransfer(accounts[1], value, { from: accounts[1] });
    const transferProposal = utils.solidityEvent(callResult, 'TransferProposal');
    const proposalId = transferProposal.args._id;
    assert.equal(transferProposal.args._proposer, accounts[1], 'Wrong proposer address in TransferProposal event');
    assert.equal(transferProposal.args._to, accounts[1], 'Wrong to-address in TransferProposal event');
    assert(transferProposal.args._value.eq(value), 'Wrong value in TransferProposal event');
    const signers = [1, 2, 5];
    for (let i = 0; i < threshold; i += 1) {
      callResult = await pools[0].confirmProposal(proposalId, { from: accounts[signers[i]] });
      const confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
      assert(confirm.args._id.eq(proposalId), 'Wrong proposal ID in confirm event');
      assert.equal(confirm.args._confirmer, accounts[signers[i]], 'Wrong confirmer address in confirm event');
    }
    callResult = await pools[0].executeProposal(proposalId, { from: accounts[1] });
    const execution = utils.solidityEvent(callResult, 'ProposalExecution');
    assert(execution.args._id.eq(proposalId), 'Wrong proposal ID in execution event');
    assert.equal(execution.args._executer, accounts[1], 'Wrong proposal ID in execution event');
    const poolBalanceAfter = await like.balanceOf(pools[0].address);
    const accountBalanceAfter = await like.balanceOf(accounts[1]);
    assert(poolBalanceBefore.sub(poolBalanceAfter).eq(value), 'pools[0] owned wrong amount of coins after transfer');
    assert(accountBalanceAfter.sub(accountBalanceBefore).eq(value), 'accounts[1] owned wrong amount of coins after transfer');
  });

  it('should forbid executing transfer proposal without enough confirmations', async () => {
    const value = 234567890;
    const callResult = await pools[0].proposeTransfer(accounts[1], value, { from: accounts[1] });
    const proposalId = (utils.solidityEvent(callResult, 'TransferProposal')).args._id;

    await pools[0].confirmProposal(proposalId, { from: accounts[2] });
    await utils.assertSolidityThrow(async () => {
      await pools[0].executeProposal(proposalId, { from: accounts[1] });
    }, 'should forbid executing transfer proposal with only 1 confirmation');

    await pools[0].confirmProposal(proposalId, { from: accounts[3] });
    await utils.assertSolidityThrow(async () => {
      await pools[0].executeProposal(proposalId, { from: accounts[1] });
    }, 'should forbid executing transfer proposal with only 2 confirmation');
    unconfirmedPendingProposals.push(proposalId);
  });

  it('should allow multiple proposals to run in parallel', async () => {
    const poolBalanceBefore = await like.balanceOf(pools[0].address);
    const accountBalanceBefore = await like.balanceOf(accounts[1]);

    const value1 = 345678901;
    const value2 = 456789012;
    const value3 = 567890123;

    let callResult = await pools[0].proposeTransfer(accounts[1], value1, { from: accounts[2] });
    const proposalId1 = (utils.solidityEvent(callResult, 'TransferProposal')).args._id;

    callResult = await pools[0].proposeTransfer(accounts[1], value2, { from: accounts[3] });
    const proposalId2 = (utils.solidityEvent(callResult, 'TransferProposal')).args._id;
    assert(!proposalId1.eq(proposalId2), 'Two proposals have the same ID');

    callResult = await pools[0].proposeTransfer(accounts[1], value3, { from: accounts[4] });
    const proposalId3 = (utils.solidityEvent(callResult, 'TransferProposal')).args._id;
    assert(!proposalId1.eq(proposalId3), 'Two proposals have the same ID');
    assert(!proposalId2.eq(proposalId3), 'Two proposals have the same ID');

    let confirm;
    let execution;

    callResult = await pools[0].confirmProposal(proposalId1, { from: accounts[1] });
    confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
    assert.equal(confirm.args._confirmer, accounts[1], 'Wrong confirmer address in confirm event');
    assert(confirm.args._id.eq(proposalId1), 'Wrong proposal ID in confirm event');

    callResult = await pools[0].confirmProposal(proposalId2, { from: accounts[2] });
    confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
    assert.equal(confirm.args._confirmer, accounts[2], 'Wrong confirmer address in confirm event');
    assert(confirm.args._id.eq(proposalId2), 'Wrong proposal ID in confirm event');

    callResult = await pools[0].confirmProposal(proposalId3, { from: accounts[3] });
    confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
    assert.equal(confirm.args._confirmer, accounts[3], 'Wrong confirmer address in confirm event');
    assert(confirm.args._id.eq(proposalId3), 'Wrong proposal ID in confirm event');

    // Out of order
    callResult = await pools[0].confirmProposal(proposalId2, { from: accounts[3] });
    confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
    assert.equal(confirm.args._confirmer, accounts[3], 'Wrong confirmer address in confirm event');
    assert(confirm.args._id.eq(proposalId2), 'Wrong proposal ID in confirm event');

    callResult = await pools[0].confirmProposal(proposalId3, { from: accounts[4] });
    confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
    assert.equal(confirm.args._confirmer, accounts[4], 'Wrong confirmer address in confirm event');
    assert(confirm.args._id.eq(proposalId3), 'Wrong proposal ID in confirm event');

    callResult = await pools[0].confirmProposal(proposalId1, { from: accounts[2] });
    confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
    assert.equal(confirm.args._confirmer, accounts[2], 'Wrong confirmer address in confirm event');
    assert(confirm.args._id.eq(proposalId1), 'Wrong proposal ID in confirm event');

    // Out of order
    callResult = await pools[0].confirmProposal(proposalId3, { from: accounts[5] });
    confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
    assert.equal(confirm.args._confirmer, accounts[5], 'Wrong confirmer address in confirm event');
    assert(confirm.args._id.eq(proposalId3), 'Wrong proposal ID in confirm event');

    callResult = await pools[0].confirmProposal(proposalId1, { from: accounts[3] });
    confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
    assert.equal(confirm.args._confirmer, accounts[3], 'Wrong confirmer address in confirm event');
    assert(confirm.args._id.eq(proposalId1), 'Wrong proposal ID in confirm event');

    callResult = await pools[0].confirmProposal(proposalId2, { from: accounts[4] });
    confirm = utils.solidityEvent(callResult, 'ProposalConfirmation');
    assert.equal(confirm.args._confirmer, accounts[4], 'Wrong confirmer address in confirm event');
    assert(confirm.args._id.eq(proposalId2), 'Wrong proposal ID in confirm event');

    callResult = await pools[0].executeProposal(proposalId3, { from: accounts[5] });
    execution = utils.solidityEvent(callResult, 'ProposalExecution');
    assert(execution.args._id.eq(proposalId3), 'Wrong proposal ID in execution event');
    const poolBalanceAfter3 = await like.balanceOf(pools[0].address);
    const accountBalanceAfter3 = await like.balanceOf(accounts[1]);
    assert(poolBalanceAfter3.eq(poolBalanceBefore.sub(value3)), 'pools[0] owned wrong amount of coins after executing proposal 3');
    assert(accountBalanceAfter3.eq(accountBalanceBefore.add(value3)), 'accounts[1] owned wrong amount of coins after executing proposal 3');

    callResult = await pools[0].executeProposal(proposalId1, { from: accounts[3] });
    execution = utils.solidityEvent(callResult, 'ProposalExecution');
    assert(execution.args._id.eq(proposalId1), 'Wrong proposal ID in execution event');
    const poolBalanceAfter1 = await like.balanceOf(pools[0].address);
    const accountBalanceAfter1 = await like.balanceOf(accounts[1]);
    assert(poolBalanceAfter1.eq(poolBalanceAfter3.sub(value1)), 'pools[0] owned wrong amount of coins after executing proposal 1');
    assert(accountBalanceAfter1.eq(accountBalanceAfter3.add(value1)), 'accounts[1] owned wrong amount of coins after executing proposal 1');

    callResult = await pools[0].executeProposal(proposalId2, { from: accounts[4] });
    execution = utils.solidityEvent(callResult, 'ProposalExecution');
    assert(execution.args._id.eq(proposalId2), 'Wrong proposal ID in execution event');
    const poolBalanceAfter2 = await like.balanceOf(pools[0].address);
    const accountBalanceAfter2 = await like.balanceOf(accounts[1]);
    assert(poolBalanceAfter2.eq(poolBalanceAfter1.sub(value2)), 'pools[0] owned wrong amount of coins after executing proposal 2');
    assert(accountBalanceAfter2.eq(accountBalanceAfter1.add(value2)), 'accounts[1] owned wrong amount of coins after executing proposal 2');
  });

  it('should forbid non-owners to participate in transfer proposal', async () => {
    const value = 678901234;
    await utils.assertSolidityThrow(async () => {
      await pools[0].proposeTransfer(accounts[1], value, { from: accounts[6] });
    }, 'should forbid non-owner to propose transfer proposal');

    const callResult = await pools[0].proposeTransfer(accounts[1], value, { from: accounts[1] });
    const proposalId = (utils.solidityEvent(callResult, 'TransferProposal')).args._id;

    await utils.assertSolidityThrow(async () => {
      await pools[0].confirmProposal(proposalId, { from: accounts[7] });
    }, 'should forbid non-owner to confirm transfer proposal');

    await pools[0].confirmProposal(proposalId, { from: accounts[1] });
    await pools[0].confirmProposal(proposalId, { from: accounts[2] });
    await pools[0].confirmProposal(proposalId, { from: accounts[3] });

    await utils.assertSolidityThrow(async () => {
      await pools[0].executeProposal(proposalId, { from: accounts[8] });
    }, 'should forbid non-owner to execute transfer proposal');
    confirmedPendingProposals.push(proposalId);
  });

  it('should forbid duplicated confirmation from the same confirmer', async () => {
    const value = 789012345;
    const callResult = await pools[0].proposeTransfer(accounts[1], value, { from: accounts[1] });
    const proposalId = (utils.solidityEvent(callResult, 'TransferProposal')).args._id;
    await pools[0].confirmProposal(proposalId, { from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await pools[0].confirmProposal(proposalId, { from: accounts[1] });
    }, 'should forbid owners to confirm the same proposal more than once');
    unconfirmedPendingProposals.push(proposalId);
  });

  it('should forbid duplicated execution of TransferProposal', async () => {
    const value = 890123456;
    const callResult = await pools[0].proposeTransfer(accounts[1], value, { from: accounts[1] });
    const proposalId = (utils.solidityEvent(callResult, 'TransferProposal')).args._id;
    await pools[0].confirmProposal(proposalId, { from: accounts[1] });
    await pools[0].confirmProposal(proposalId, { from: accounts[2] });
    await pools[0].confirmProposal(proposalId, { from: accounts[3] });
    await pools[0].executeProposal(proposalId, { from: accounts[1] });
    await utils.assertSolidityThrow(async () => {
      await pools[0].executeProposal(proposalId, { from: accounts[2] });
    }, 'should forbid executing the same proposal more than once');
    await utils.assertSolidityThrow(async () => {
      await pools[0].executeProposal(proposalId, { from: accounts[1] });
    }, 'should forbid executing the same proposal more than once');
  });

  it('should forbid confirming TransferProposal more than required', async () => {
    const value = 901234567;
    const callResult = await pools[0].proposeTransfer(accounts[1], value, { from: accounts[1] });
    const proposalId = (utils.solidityEvent(callResult, 'TransferProposal')).args._id;
    await pools[0].confirmProposal(proposalId, { from: accounts[2] });
    await pools[0].confirmProposal(proposalId, { from: accounts[3] });
    await pools[0].confirmProposal(proposalId, { from: accounts[4] });
    await utils.assertSolidityThrow(async () => {
      await pools[0].confirmProposal(proposalId, { from: accounts[5] });
    }, 'should forbid confirming TransferProposal more than required');
    await pools[0].executeProposal(proposalId, { from: accounts[1] });
  });

  it('should allow set owners with confirmations', async () => {
    let callResult =
      await pools[0].proposeSetOwners(newOwners, newThreshold, { from: accounts[1] });
    const setOwnersProposal = utils.solidityEvent(callResult, 'SetOwnersProposal');
    const proposalId = setOwnersProposal.args._id;
    assert.equal(setOwnersProposal.args._proposer, accounts[1], 'Wrong proposer address in SetOwnersProposal event');
    const { _newOwners } = setOwnersProposal.args;
    assert.deepEqual(_newOwners, newOwners, 'Wrong newOwners in SetOwnersProposal event');
    assert.equal(setOwnersProposal.args._newThreshold.toNumber(), newThreshold, 'Wrong newThreshold in SetOwnersProposal event');
    callResult = await pools[0].proposeTransfer(accounts[1], 1, { from: accounts[1] });
    const transferProposalId = (utils.solidityEvent(callResult, 'TransferProposal')).args._id;
    await pools[0].confirmProposal(proposalId, { from: accounts[1] });
    await pools[0].confirmProposal(proposalId, { from: accounts[2] });
    await pools[0].confirmProposal(proposalId, { from: accounts[3] });
    callResult = await pools[0].executeProposal(proposalId, { from: accounts[1] });
    const execution = utils.solidityEvent(callResult, 'ProposalExecution');
    assert(execution.args._id.eq(proposalId), 'Wrong proposal ID in execution event');
    const ownersCount = (await pools[0].ownersCount()).toNumber();
    assert.equal(ownersCount, newOwners.length, 'pools[0] has wrong number of owners after executing SetOwnersProposal');
    for (let i = 0; i < ownersCount; i += 1) {
      assert.equal(await pools[0].owners(i), newOwners[i], `pools[0] has wrong owner at index ${i} after executing SetOwnersProposal`);
    }
    assert.equal((await pools[0].threshold()).toNumber(), newThreshold, 'pools[0] has wrong threshold after executing SetOwnersProposal');
    await utils.assertSolidityThrow(async () => {
      await pools[0].executeProposal(proposalId, { from: accounts[5] });
    }, 'should forbid executing the same set owners proposal more than once');
    await utils.assertSolidityThrow(async () => {
      await pools[0].confirmProposal(transferProposalId, { from: accounts[5] });
    }, 'should void old transfer proposal');
  });

  it('should void old owners', async () => {
    for (let i = 1; i <= 4; i += 1) {
      await utils.assertSolidityThrow(async () => {
        await pools[0].proposeTransfer(accounts[1], 123456789, { from: accounts[i] });
      }, `should not allow old owner accounts[${i}] to propose TransferProposal`);
      await utils.assertSolidityThrow(async () => {
        await pools[0].proposeSetOwners(newOwners, newThreshold, { from: accounts[i] });
      }, `should not allow old owner accounts[${i}] to propose SetOwnersProposal`);
    }
  });

  it('should void all pending proposals after set owners', async () => {
    for (let i = 0; i < unconfirmedPendingProposals.length; i += 1) {
      await utils.assertSolidityThrow(async () => {
        await pools[0].confirmProposal(unconfirmedPendingProposals[i], { from: accounts[5] });
      }, 'should not allow confirming old proposals');
    }
    for (let i = 0; i < confirmedPendingProposals.length; i += 1) {
      await utils.assertSolidityThrow(async () => {
        await pools[0].executeProposal(confirmedPendingProposals[i], { from: accounts[5] });
      }, 'should not allow executing old proposals');
    }
  });

  it('should not allow executing set owners without enough confirm', async () => {
    const callResult =
      await pools[0].proposeSetOwners(newOwners, newThreshold, { from: accounts[5] });
    const setOwnersProposal = utils.solidityEvent(callResult, 'SetOwnersProposal');
    const proposalId = setOwnersProposal.args._id;
    await utils.assertSolidityThrow(async () => {
      await pools[0].executeProposal(proposalId, { from: accounts[5] });
    }, 'should not allow executing unconfirmed SetOwnersProposal');
    await pools[0].confirmProposal(proposalId, { from: accounts[5] });
    await utils.assertSolidityThrow(async () => {
      await pools[0].executeProposal(proposalId, { from: accounts[5] });
    }, 'should not allow executing unconfirmed SetOwnersProposal');
  });

  it('should forbid non-owners to participate in set owner proposal', async () => {
    await utils.assertSolidityThrow(async () => {
      await pools[0].proposeSetOwners(newOwners, newThreshold, { from: accounts[9] });
    }, 'should not allow non-owner to propose SetOwnersProposal');

    const callResult =
      await pools[0].proposeSetOwners(newOwners, newThreshold, { from: accounts[5] });
    const setOwnersProposal = utils.solidityEvent(callResult, 'SetOwnersProposal');
    const proposalId = setOwnersProposal.args._id;

    await utils.assertSolidityThrow(async () => {
      await pools[0].confirmProposal(proposalId, { from: accounts[9] });
    }, 'should not allow non-owner to confirm SetOwnersProposal');

    await pools[0].confirmProposal(proposalId, { from: accounts[5] });
    await pools[0].confirmProposal(proposalId, { from: accounts[6] });

    await utils.assertSolidityThrow(async () => {
      await pools[0].executeProposal(proposalId, { from: accounts[9] });
    }, 'should not allow non-owner to execute SetOwnersProposal');
  });

  it('should forbid confirming SetOwnersProposal more than required', async () => {
    const callResult =
      await pools[0].proposeSetOwners(newOwners, newThreshold, { from: accounts[5] });
    const setOwnersProposal = utils.solidityEvent(callResult, 'SetOwnersProposal');
    const proposalId = setOwnersProposal.args._id;
    await pools[0].confirmProposal(proposalId, { from: accounts[6] });
    await pools[0].confirmProposal(proposalId, { from: accounts[7] });
    await utils.assertSolidityThrow(async () => {
      await pools[0].confirmProposal(proposalId, { from: accounts[8] });
    }, 'should forbid confirming SetOwnersProposal more than required');
    await pools[0].executeProposal(proposalId, { from: accounts[5] });
  });

  it('should forbid invalid number of owners and threshold values when proposing SetOwnersProposal', async () => {
    await utils.assertSolidityThrow(async () => {
      await pools[0].proposeSetOwners([], 0, { from: accounts[5] });
    }, 'should forbid proposing setOwnersProposal with no owners');

    await utils.assertSolidityThrow(async () => {
      await pools[0].proposeSetOwners([accounts[0], accounts[1]], 3, { from: accounts[5] });
    }, 'should forbid proposing setOwnersProposal with threshold value larger than number of owners');

    await utils.assertSolidityThrow(async () => {
      await pools[0].proposeSetOwners([accounts[0], accounts[1]], 0, { from: accounts[5] });
    }, 'should forbid proposing setOwnersProposal with threshold value 0');

    await pools[0].proposeSetOwners([accounts[0], accounts[1]], 2, { from: accounts[5] });
    await pools[0].proposeSetOwners([accounts[0], accounts[1]], 1, { from: accounts[5] });

    await utils.assertSolidityThrow(async () => {
      await pools[0].proposeSetOwners([accounts[0], accounts[0]], 2, { from: accounts[5] });
    }, 'should forbid proposing setOwnersProposal with duplicated addresses in owners');
  });
});

contract('LikeCoin Creators Pools Overflow', (accounts) => {
  it('should forbid minting with values overflowing the total supply', async () => {
    // The blocktime of next block could be affected by snapshot and revert, so mine the next block
    // immediately by calling testrpcIncreaseTime
    await utils.testrpcIncreaseTime(1);
    const mintValue0 = new BigNumber(2).pow(256).sub(2);
    const mintValue1 = 1;
    const like = await LikeCoin.new(1, 0x0, 0x0);
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    const mintTime = now + 1000;
    const pool0 = await CreatorsPool.new(like.address, [accounts[0]], 1, mintTime, mintValue0);
    const pool1 = await CreatorsPool.new(like.address, [accounts[0]], 1, mintTime, mintValue1);
    await like.registerCreatorsPools([pool0.address, pool1.address], mintValue0.add(mintValue1));
    await utils.testrpcIncreaseTime((mintTime - now) + 1);
    await pool0.mint();
    await utils.assertSolidityThrow(async () => {
      await pool1.mint();
    }, 'should forbid minting with values overflowing the total supply');
  });
});

contract('LikeCoin Creators Pools Invalid IDs', (accounts) => {
  it('should forbid confirming or executing invalid proposal IDs', async () => {
    // The blocktime of next block could be affected by snapshot and revert, so mine the next block
    // immediately by calling testrpcIncreaseTime
    await utils.testrpcIncreaseTime(1);
    const like = await LikeCoin.new(0, 0x0, 0x0);
    const now = web3.eth.getBlock(web3.eth.blockNumber).timestamp;
    const mintTime = now + 1000;
    const pool = await CreatorsPool.new(like.address, [accounts[0]], 1, mintTime, mintValues[0]);
    await like.registerCreatorsPools([pool.address], mintValues[0]);
    await utils.testrpcIncreaseTime((mintTime - now) + 1);
    await pool.mint();
    const upperBound = new BigNumber(2).pow(64);
    for (let i = 0; i < 10; i += 1) {
      await utils.assertSolidityThrow(async () => {
        await pool.confirmProposal(i, { from: accounts[0] });
      }, `should forbid confirming invalid proposal with ID ${i}`);
      await utils.assertSolidityThrow(async () => {
        await pool.executeProposal(i, { from: accounts[0] });
      }, `should forbid executing invalid proposal with ID ${i}`);

      await utils.assertSolidityThrow(async () => {
        await pool.confirmProposal(upperBound.sub(i + 1), { from: accounts[0] });
      }, `should forbid confirming invalid proposal with ID ${upperBound.sub(i + 1).toFixed()}`);
      await utils.assertSolidityThrow(async () => {
        await pool.confirmProposal(upperBound.sub(i + 1), { from: accounts[0] });
      }, `should forbid executing invalid proposal with ID ${upperBound.sub(i + 1).toFixed()}`);

      // 2^64 ~= 1.8e19, so 20 decimal places contains enough entropy for random number in [0, 2^64)
      const randId = BigNumber.random(20).mul(upperBound).floor();
      await utils.assertSolidityThrow(async () => {
        await pool.confirmProposal(randId, { from: accounts[0] });
      }, `should forbid confirming invalid proposal with ID ${randId.toFixed()}`);
      await utils.assertSolidityThrow(async () => {
        await pool.executeProposal(randId, { from: accounts[0] });
      }, `should forbid executing invalid proposal with ID ${randId.toFixed()}`);
    }
    // repeat after setOwners
    const callResult = await pool.proposeSetOwners([accounts[0]], 1, { from: accounts[0] });
    const setOwnersProposal = utils.solidityEvent(callResult, 'SetOwnersProposal');
    const proposalId = setOwnersProposal.args._id;
    await pool.confirmProposal(proposalId, { from: accounts[0] });
    await pool.executeProposal(proposalId, { from: accounts[0] });

    for (let i = 0; i < 10; i += 1) {
      await utils.assertSolidityThrow(async () => {
        await pool.confirmProposal(i, { from: accounts[0] });
      }, `should forbid confirming invalid proposal with ID ${i}`);
      await utils.assertSolidityThrow(async () => {
        await pool.executeProposal(i, { from: accounts[0] });
      }, `should forbid executing invalid proposal with ID ${i}`);

      await utils.assertSolidityThrow(async () => {
        await pool.confirmProposal(upperBound.sub(i + 1), { from: accounts[0] });
      }, `should forbid confirming invalid proposal with ID ${upperBound.sub(i + 1).toFixed()}`);
      await utils.assertSolidityThrow(async () => {
        await pool.confirmProposal(upperBound.sub(i + 1), { from: accounts[0] });
      }, `should forbid executing invalid proposal with ID ${upperBound.sub(i + 1).toFixed()}`);

      // 2^64 ~= 1.8e19, so 20 decimal places contains enough entropy for random number in [0, 2^64)
      const randId = BigNumber.random(20).mul(upperBound).floor();
      await utils.assertSolidityThrow(async () => {
        await pool.confirmProposal(randId, { from: accounts[0] });
      }, `should forbid confirming invalid proposal with ID ${randId.toFixed()}`);
      await utils.assertSolidityThrow(async () => {
        await pool.executeProposal(randId, { from: accounts[0] });
      }, `should forbid executing invalid proposal with ID ${randId.toFixed()}`);
    }
  });
});

// vim: set ts=2 sw=2:
