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

pragma solidity ^0.4.18;

import "zeppelin-solidity/contracts/math/SafeMath.sol";
import "zeppelin-solidity/contracts/ownership/Claimable.sol";
import "./LikeCoin.sol";

contract ContributorPool is Claimable {
    using SafeMath for uint256;

    LikeCoin public like = LikeCoin(0x0);
    uint256 public lockDuration = 0;
    uint256 public lockedCoin = 0;

    uint64 nextId = 1;

    struct GiveInfo {
        uint64 id;
        address to;
        uint256 value;
        uint256 unlockTime;
    }
    mapping (uint64 => GiveInfo) giveInfo;
    event Give(uint64 indexed _id, address _to, uint256 _value);
    event Claimed(uint64 indexed _id);

    function ContributorPool(address _likeAddr, uint256 _lockDuration) public {
        like = LikeCoin(_likeAddr);
        lockDuration = _lockDuration;
    }

    function getRemainingLikeCoins() public constant returns (uint256) {
        return like.balanceOf(address(this)) - lockedCoin;
    }

    function getUnlockTime(uint64 id) public constant returns (uint256) {
        return giveInfo[id].unlockTime;
    }

    function _nextId() internal returns (uint64 id) {
        id = nextId;
        nextId += 1;
        return id;
    }

    function give(address _to, uint256 _value) onlyOwner public {
        require(_value > 0);
        require(getRemainingLikeCoins() >= _value);
        uint64 id = _nextId();
        giveInfo[id] = GiveInfo(id, _to, _value, now + lockDuration);
        lockedCoin = lockedCoin.add(_value);
        Give(id, _to, _value);
    }

    function claim(uint64 id) public {
        require(giveInfo[id].id == id);
        address claimer = msg.sender;
        require(giveInfo[id].to == claimer);
        require(giveInfo[id].unlockTime < now);
        uint256 value = giveInfo[id].value;
        lockedCoin = lockedCoin.sub(value);
        delete giveInfo[id];
        like.transfer(claimer, value);
        Claimed(id);
    }
}
