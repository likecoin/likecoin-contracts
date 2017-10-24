/* eslint-env mocha, node */
/* global artifacts, contract, assert, web3 */

const utils = require("./utils.js");
const ethUtil = require("ethereumjs-util");
const BigNumber = require("bignumber.js");
const LikeCoin = artifacts.require("./LikeCoin.sol");
const UserGrowthPool = artifacts.require("./UserGrowthPool.sol");
const crypto = require("crypto");

const decimalFactor = new BigNumber(10).pow(18);
const accountInfo = require("../accounts.json");

function coinsToCoinUnits(value) {
    return decimalFactor.times(value);
}

function hexToBuffer(hexString) {
    return Buffer.from(hexString.replace("0x", ""), "hex");
}

function sign(hashHex, privKeyHex) {
    const hashBuffer = hexToBuffer(hashHex);
    const signature = ethUtil.ecsign(hashBuffer, hexToBuffer(privKeyHex));
    const r = ethUtil.bufferToHex(ethUtil.setLengthLeft(signature.r, 32));
    const s = ethUtil.bufferToHex(ethUtil.setLengthLeft(signature.s, 32));
    const v = signature.v;
    return {v, r, s};
}

const mintGap = 60 * 60 * 24 * 365;
const mintValues = {
    0: coinsToCoinUnits(152000000),
    1: coinsToCoinUnits(136000000),
    2: coinsToCoinUnits(120000000),
    3: coinsToCoinUnits(104000000),
    4: coinsToCoinUnits(88000000),
    5: coinsToCoinUnits(72000000),
    6: coinsToCoinUnits(56000000),
    7: coinsToCoinUnits(40000000),
    8: coinsToCoinUnits(24000000),
    9: coinsToCoinUnits(8000000),
};

contract("LikeCoin User Growth Pools", (accounts) => {
    let like;
    const mintTimes = [];
    const pools = [];
    const threshold = 3;
    const owners = [1, 2, 3, 4, 5].map((i) => {
        return {address: accountInfo[i].address, privKey: accountInfo[i].secretKey};
    });
    const ownerAddrs = owners.map((acc) => acc.address);
    let newOwners;
    let newOwnerAddrs;
    let newThreshold;
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
            const pool = await UserGrowthPool.new(like.address, ownerAddrs, threshold, mintTime, mintValues[i]);
            pools.push(pool);
        }
    });

    it("should deploy the UserGrowthPool contracts correctly", async () => {
        for (let i of Object.keys(mintValues)) {
            const pool = pools[i];
            const ownersCount = (await pool.ownersCount()).toNumber();
            assert.equal(ownersCount, owners.length, `pools[${i}] has wrong number of owners`);
            for (let j = 0; j < ownersCount; j++) {
                assert.equal(await pool.owners(j), owners[j].address, `pools[${i}] has wrong owner at index ${j}`);
            }
            assert.equal((await pool.threshold()).toNumber(), threshold, `pools[${i}] has wrong threshold`);
            assert.equal((await pool.mintTime()).toNumber(), mintTimes[i], `pools[${i}] has wrong mintTime`);
            assert((await pool.mintValue()).eq(mintValues[i]), `pools[${i}] has wrong mintValue`);
        }
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

    it("should allow transfer with signatures after mintTime", async () => {
        const poolBalanceBefore = await like.balanceOf(pools[0].address);
        const accountBalanceBefore = await like.balanceOf(accounts[1]);
        const value = 123456789;
        const nonce = 1337;
        const hash = await pools[0].hashTransfer(nonce, accounts[1], value);
        const signatures = [0, 3, 4].map((i) => sign(hash, owners[i].privKey));
        const rs = signatures.map((sig) => sig.r);
        const ss = signatures.map((sig) => sig.s);
        const vs = signatures.map((sig) => sig.v);
        await pools[0].transfer(rs, ss, vs, [nonce, nonce, nonce], accounts[1], value);
        const poolBalanceAfter = await like.balanceOf(pools[0].address);
        const accountBalanceAfter = await like.balanceOf(accounts[1]);
        assert(poolBalanceBefore.sub(poolBalanceAfter).eq(value), "pools[0] owned wrong amount of coins after transfer");
        assert(accountBalanceAfter.sub(accountBalanceBefore).eq(value), "accounts[1] owned wrong amount of coins after transfer");
    });

    it("should forbid transferring with invalid signatures", async () => {
        const usedNonce = 1337;
        const nonce = 8890;
        const value = 234567890;
        let hash;
        let signatures;
        let rs;
        let ss;
        let vs;

        // random bytes as signature
        rs = [1, 2, 3].map(() => ethUtil.bufferToHex(crypto.randomBytes(32)));
        ss = [1, 2, 3].map(() => ethUtil.bufferToHex(crypto.randomBytes(32)));
        vs = [26, 27, 27];
        await utils.assertSolidityThrow(async () => {
            await pools[0].transfer(rs, ss, vs, [nonce, nonce, nonce], accounts[1], value);
        }, "Should forbid calling transfer by random byte singatures");

        // signature arrays length != threshold
        hash = await pools[0].hashTransfer(nonce, accounts[1], value);
        signatures = [0, 1].map((i) => sign(hash, owners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[0].transfer(rs, ss, vs, [nonce, nonce, nonce], accounts[1], value);
        }, "Should forbid calling transfer with insufficient number of signatures");

        // repeated owner in signature arrays
        hash = await pools[0].hashTransfer(nonce + 1, accounts[1], value);
        const repeatedSig = sign(hash, owners[1].privKey);
        rs.push(repeatedSig.r);
        ss.push(repeatedSig.s);
        vs.push(repeatedSig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[0].transfer(rs, ss, vs, [nonce, nonce, nonce + 1], accounts[1], value);
        }, "Should forbid calling transfer with repeated owner");

        // inconsistent order between signature arrays
        hash = await pools[0].hashTransfer(nonce, accounts[1], value);
        signatures = [0, 1, 2].map((i) => sign(hash, owners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        [rs[0], rs[1]] = [rs[1], rs[0]];
        await utils.assertSolidityThrow(async () => {
            await pools[0].transfer(rs, ss, vs, [nonce, nonce, nonce], accounts[1], value);
        }, "Should forbid calling transfer with inconsistent order between signature arrays");

        // signatures not for the given parameters
        hash = await pools[0].hashTransfer(nonce, accounts[1], value);
        signatures = [0, 1, 2].map((i) => sign(hash, owners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[0].transfer(rs, ss, vs, [nonce, nonce, nonce], accounts[2], value);
        }, "Should forbid calling transfer with signatures on different set of parameters");
        await utils.assertSolidityThrow(async () => {
            await pools[0].transfer(rs, ss, vs, [nonce, nonce, nonce], accounts[1], value + 1);
        }, "Should forbid calling transfer with signatures on different set of parameters");

        // reuse nonce
        hash = await pools[0].hashTransfer(usedNonce, accounts[1], value);
        signatures = [0, 1, 2].map((i) => sign(hash, owners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[0].transfer(rs, ss, vs, [usedNonce, usedNonce, usedNonce], accounts[1], value);
        }, "Should forbid calling transfer with used nonce");

        // replay on other functions - don't know how to construct suitable sets of parameters, skip
        // replay on other pools
        hash = await pools[0].hashTransfer(nonce, accounts[1], value);
        signatures = [0, 1, 2].map((i) => sign(hash, owners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[1].transfer(rs, ss, vs, [nonce, nonce, nonce], accounts[1], value);
        }, "Should forbid calling transfer with signatures from another pool");
    });

    it("should allow owner B to reuse the nonce owner A used", async () => {
        // Owner 1, 2 have not used 1337 as nonce
        const nonces = [8890, 1337, 1337];
        const value = 234567890;
        const rs = [];
        const ss = [];
        const vs = [];
        for (let i = 0; i <= 2; i++) {
            const hash = await pools[0].hashTransfer(nonces[i], accounts[2], value);
            const sig = sign(hash, owners[i].privKey);
            rs.push(sig.r);
            ss.push(sig.s);
            vs.push(sig.v);
        }
        await pools[0].transfer(rs, ss, vs, nonces, accounts[2], value);
    });

    it("should allow setting owners to others using signatures", async () => {
        let nonce = 9012;
        newOwners = [5, 6, 7, 8].map((i) => {
            return {address: accountInfo[i].address, privKey: accountInfo[i].secretKey};
        });
        newOwnerAddrs = newOwners.map((acc) => acc.address);
        newThreshold = 2;
        let hash = await pools[0].hashSetOwners(nonce, newOwnerAddrs, newThreshold);
        let signatures = [2, 3, 1].map((i) => sign(hash, owners[i].privKey));
        let rs = signatures.map((sig) => sig.r);
        let ss = signatures.map((sig) => sig.s);
        let vs = signatures.map((sig) => sig.v);
        await pools[0].setOwners(rs, ss, vs, [nonce, nonce, nonce], newOwnerAddrs, newThreshold);
        assert.equal(await pools[0].ownersCount(), newOwners.length, "pools[0] has wrong number of owners");
        for (let i = 0; i < newOwners.length; i++) {
            assert.equal(await pools[0].owners(i), newOwners[i].address, `pools[0] has wrong owner at index ${i}`);
        }
        assert.equal(await pools[0].threshold(), newThreshold, "pools[0] has wrong threshold");

        // Test if ownership really transferred
        // Old threshold with old owner signatures
        const value = 345678901;
        nonce = 1023;
        hash = await pools[0].hashTransfer(nonce, accounts[3], value);
        signatures = [0, 1, 4].map((i) => sign(hash, owners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[0].transfer(rs, ss, vs, [nonce, nonce, nonce], accounts[3], value);
        }, "Old owners should not be able to call transfer");

        // New threshold with old owner signatures
        rs.pop();
        ss.pop();
        vs.pop();
        await utils.assertSolidityThrow(async () => {
            await pools[0].transfer(rs, ss, vs, [nonce, nonce], accounts[3], value);
        }, "Old owners should not be able to call transfer");

        signatures = [0, 1].map((i) => sign(hash, newOwners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        await pools[0].transfer(rs, ss, vs, [nonce, nonce], accounts[3], value);
    });

    it("should forbid setting owners to others with invalid signatures", async () => {
        const usedNonce = 1023;
        const nonce = 1025;

        // I can't find better names, may uncle Bob forgive my sins...
        const newNewOwners = [7, 8, 9].map((i) => {
            return {address: accountInfo[i].address, privKey: accountInfo[i].secretKey};
        });
        const newNewOwnerAddrs = newNewOwners.map((acc) => acc.address);
        const newNewThreshold = 1;
        let hash;
        let signatures;
        let rs;
        let ss;
        let vs;

        // random bytes as signature
        rs = [1, 2].map(() => ethUtil.bufferToHex(crypto.randomBytes(32)));
        ss = [1, 2].map(() => ethUtil.bufferToHex(crypto.randomBytes(32)));
        vs = [26, 27];
        await utils.assertSolidityThrow(async () => {
            await pools[0].setOwners(rs, ss, vs, [nonce, nonce], newNewOwnerAddrs, newNewThreshold);
        }, "Should forbid calling setOwners by random byte singatures");

        // signature arrays length != threshold
        hash = await pools[0].hashSetOwners(nonce, newNewOwnerAddrs, newNewThreshold);
        signatures = sign(hash, newOwners[0].privKey);
        rs = [signatures.r];
        ss = [signatures.s];
        vs = [signatures.v];
        await utils.assertSolidityThrow(async () => {
            await pools[0].setOwners(rs, ss, vs, [nonce], newNewOwnerAddrs, newNewThreshold);
        }, "Should forbid calling setOwners with insufficient number of signatures");

        // repeated owner in signature arrays
        hash = await pools[0].hashSetOwners(nonce + 1, newNewOwnerAddrs, newNewThreshold);
        const repeatedSig = sign(hash, newOwners[0].privKey);
        rs.push(repeatedSig.r);
        ss.push(repeatedSig.s);
        vs.push(repeatedSig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[0].setOwners(rs, ss, vs, [nonce, nonce + 1], newNewOwnerAddrs, newNewThreshold);
        }, "Should forbid calling setOwners with repeated owner");

        // inconsistent order between signature arrays
        hash = await pools[0].hashSetOwners(nonce, newNewOwnerAddrs, newNewThreshold);
        signatures = [0, 1, 2].map((i) => sign(hash, newOwners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        [rs[0], rs[1]] = [rs[1], rs[0]];
        await utils.assertSolidityThrow(async () => {
            await pools[0].setOwners(rs, ss, vs, [nonce, nonce], newNewOwnerAddrs, newNewThreshold);
        }, "Should forbid calling setOwners with inconsistent order between signature arrays");

        // signatures not for the given parameters
        hash = await pools[0].hashSetOwners(nonce, newNewOwnerAddrs, newNewThreshold);
        signatures = [0, 1, 2].map((i) => sign(hash, newOwners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[0].setOwners(rs, ss, vs, [nonce, nonce], newNewOwnerAddrs, newNewThreshold + 1);
        }, "Should forbid calling setOwners with signatures on different set of parameters");
        await utils.assertSolidityThrow(async () => {
            await pools[0].setOwners(rs, ss, vs, [nonce, nonce], newNewOwnerAddrs.slice(0, 1), newNewThreshold);
        }, "Should forbid calling setOwners with signatures on different set of parameters");

        // reuse nonce
        hash = await pools[0].hashSetOwners(usedNonce, newNewOwnerAddrs, newNewThreshold);
        signatures = [0, 1, 2].map((i) => sign(hash, newOwners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[0].setOwners(rs, ss, vs, [usedNonce, usedNonce], newNewOwnerAddrs, newNewThreshold);
        }, "Should forbid calling setOwners with used nonce");

        // replay on other functions - don't know how to construct suitable sets of parameters, skip
        // replay on other pools
        hash = await pools[0].hashSetOwners(nonce, newNewOwnerAddrs, newNewThreshold);
        signatures = [0, 1, 2].map((i) => sign(hash, owners[i].privKey));
        rs = signatures.map((sig) => sig.r);
        ss = signatures.map((sig) => sig.s);
        vs = signatures.map((sig) => sig.v);
        await utils.assertSolidityThrow(async () => {
            await pools[1].setOwners(rs, ss, vs, [nonce, nonce, nonce], newNewOwnerAddrs, newNewThreshold);
        }, "Should forbid calling setOwners with signatures from another pool");
    });
});
