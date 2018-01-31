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

import "zeppelin-solidity/contracts/ownership/Claimable.sol";
import "./LikeCoin.sol";

contract ContributorPool is Claimable {
    LikeCoin public like = LikeCoin(0x0);
    uint public mintCoolDown = 0;
    uint256 public mintValue = 0;
    uint public nextMintTime = 0;

    function ContributorPool(address _likeAddr, uint _mintCoolDown, uint256 _mintValue) public {
        require(_mintValue > 0);
        require(_mintCoolDown > 0);
        like = LikeCoin(_likeAddr);
        mintCoolDown = _mintCoolDown;
        mintValue = _mintValue;
    }

    function mint() onlyOwner public {
        require(now > nextMintTime);
        nextMintTime = now + mintCoolDown;
        like.mintForContributorPool(mintValue);
    }

    function transfer(address _to, uint256 _value) onlyOwner public {
        require(_value > 0);
        like.transfer(_to, _value);
    }
}
