# StellaSwap IDO Contracts

  
The official smart contracts for StellaSwap IDO. The repository contains two contracts:
 - IDOLocker.sol - The contract responsible to lock xStella for getting allocation on Presale.
 - IDOSale.sol - The actual IDO contract to get xStella details from Locker and calculate Max Cap of user. 
 

### Features of IDOLocker.sol
- Create or Update Pools
- Each Pool will have settings such as:
	- **Start Time** - The time to start locking from - usually 5 days before presale.
	- **End Time** - The time to stop locking till - usually 24 hours before pre-sale.
	- **Unlock time** - The time when users will be able to unlock tokens - usually 10 days after presale.
  
### Features of IDOSale.sol
Steps to Perform IDO
1. Initialize contract with correct details
2. Initialize settings with correct details
3. Presale owner to send Sale Tokens
4. White list users if whitelist sale
5. Add Tiers ( Tier includes two params, locked token and max cap)

### Running test cases
```
yarn test test/1-ido-locker-test.js

```