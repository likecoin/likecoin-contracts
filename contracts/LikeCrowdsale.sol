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
import "./LikeCoin.sol";
import "./HasOperator.sol";

contract LikeCrowdsale is HasOperator {
    using SafeMath for uint256;

    LikeCoin public like = LikeCoin(0x0);
    uint public start = 0;
    uint public end = 0;
    uint256 public coinsPerEth = 0;

    mapping (address => bool) public kycDone;

    bool finalized = false;

    event PriceChanged(uint256 _newPrice);
    event AddPrivateFund(address indexed _addr, uint256 _value);
    event RegisterKYC(address indexed _addr);
    event Purchase(address indexed _addr, uint256 _ethers, uint256 _coins);
    event LikeTransfer(address indexed _to, uint256 _value);
    event Finalize();

    function LikeCrowdsale(address _likeAddr, uint _start, uint _end, uint256 _coinsPerEth) public {
        require(_coinsPerEth != 0);
        require(now < _start);
        require(_start < _end);
        owner = msg.sender;
        like = LikeCoin(_likeAddr);
        start = _start;
        end = _end;
        coinsPerEth = _coinsPerEth;
    }

    function changePrice(uint256 _newCoinsPerEth) onlyOwner public {
        require(_newCoinsPerEth != 0);
        require(_newCoinsPerEth != coinsPerEth);
        require(now < start);
        coinsPerEth = _newCoinsPerEth;
        PriceChanged(_newCoinsPerEth);
    }

    function addPrivateFund(address _addr, uint256 _value) onlyOwner public {
        require(now < start);
        require(_value > 0);
        like.transferAndLock(_addr, _value);
        AddPrivateFund(_addr, _value);
    }

    function registerKYC(address[] _customerAddrs) ownerOrOperator public {
        for (uint32 i = 0; i < _customerAddrs.length; ++i) {
            kycDone[_customerAddrs[i]] = true;
            RegisterKYC(_customerAddrs[i]);
        }
    }

    function () public payable {
        require(now >= start);
        require(now < end);
        require(!finalized);
        require(msg.value > 0);
        require(kycDone[msg.sender]);
        uint256 coins = coinsPerEth.mul(msg.value);
        like.transfer(msg.sender, coins);
        Purchase(msg.sender, msg.value, coins);
    }

    function transferLike(address _to, uint256 _value) onlyOwner public {
        require(now < start || now >= end);
        like.transfer(_to, _value);
        LikeTransfer(_to, _value);
    }

    function finalize() ownerOrOperator public {
        require(!finalized);
        require(now >= start);
        uint256 remainingCoins = like.balanceOf(this);
        require(now >= end || remainingCoins == 0);
        owner.transfer(this.balance);
        finalized = true;
        Finalize();
    }
}
