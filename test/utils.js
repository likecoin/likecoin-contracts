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

/* global Promise, web3 */

const accounts = require('./accounts.json');
const BigNumber = require('bignumber.js');

async function assertSolidityThrow(f, message) {
  try {
    await f();
  } catch (e) {
    if (/VM Exception while processing transaction/.test(e.message)) {
      return;
    }
    throw new Error(`${message} (${e.message})`);
  }
  throw new Error(`${message} (returned successfully)`);
}

function solidityEventPromise(eventSource, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let stopped = false;
    const filter = eventSource.watch((err, event) => {
      if (!stopped) {
        filter.stopWatching();
        stopped = true;
      }
      if (err) {
        reject(err);
      } else {
        resolve(event);
      }
    });

    // If no timeout is set and the event is missed, the test will run forever
    if (timeout !== 0) {
      setTimeout(() => {
        if (!stopped) {
          filter.stopWatching();
          stopped = true;
          reject(new Error('event timeout'));
        }
      }, timeout);
    }
    return filter;
  });
}

function solidityEvent(callResult, eventName) {
  const logs = callResult.logs.filter(log => log.event === eventName);
  if (logs.length === 0) {
    throw new Error(`No event named ${eventName} found`);
  } else if (logs.length > 1) {
    throw new Error(`More than one event named ${eventName}`);
  }
  return logs[0];
}

function jsonRpc(method, ...params) {
  return new Promise((resolve, reject) =>
    web3.currentProvider.sendAsync({
      jsonrpc: '2.0',
      method,
      params,
      id: Math.floor(Math.random() * 0xFFFFFFFF),
    }, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    }));
}

async function testrpcIncreaseTime(seconds) {
  await jsonRpc('evm_increaseTime', seconds);
  await jsonRpc('evm_mine');
  return web3.eth.getBlock(web3.eth.blockNumber).timestamp;
}

async function setBalance(addr, balance) {
  const origBalance = web3.eth.getBalance(addr);
  if (origBalance.gt(balance)) {
    const toSend = origBalance.sub(balance);
    await web3.eth.sendTransaction({
      from: addr,
      to: accounts[accounts.length - 1].address,
      value: toSend,
      gasPrice: 0,
    });
  } else {
    const toSend = balance.sub(origBalance);
    await web3.eth.sendTransaction({
      from: accounts[accounts.length - 1].address,
      to: addr,
      value: toSend,
      gasPrice: 0,
    });
  }
}

const decimalFactor = new BigNumber(10).pow(18);

function coinsToCoinUnits(value) {
  return decimalFactor.times(value);
}

module.exports = {
  assertSolidityThrow,
  solidityEvent,
  solidityEventPromise,
  testrpcIncreaseTime,
  setBalance,
  coinsToCoinUnits,
};

// vim: set ts=2 sw=2:
