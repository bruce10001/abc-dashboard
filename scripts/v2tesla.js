import { Contract, JsonRpcProvider } from 'ethers';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const CONFIG = require('./config.json');
const { espaceABCabi } = require('./abi/abc.json');
const { espaceV2abi } = require('./abi/v2.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'teslaSnapshot.json');

const gWei = BigInt(Math.pow(10, 18));

function waitMilliseconds(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function readExistingData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading existing data:', err.message);
  }
  return [];
}

function writeData(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log('Data written to', DATA_FILE);
}

function upsertRecords(existingData, newRecords, keyCols) {
  for (const newRecord of newRecords) {
    const index = existingData.findIndex(item =>
      keyCols.every(key => item[key] === newRecord[key])
    );
    if (index >= 0) {
      existingData[index] = newRecord;
    } else {
      existingData.push(newRecord);
    }
  }
  return existingData;
}

const provider = new JsonRpcProvider(CONFIG.eSpaceUrl);
const espaceABCcontract = new Contract(CONFIG.espaceABCContractAddr, espaceABCabi, provider);
const espaceABCV2contract = new Contract(CONFIG.ABCV2PoolEspaceContractAddr, espaceV2abi, provider);

async function findBlockByTimestamp(targetTimestamp) {
  let latestBlock = await provider.getBlock("latest");
  let latestBlockNumber = latestBlock.number;

  let low = 0;
  let high = latestBlockNumber;
  let closestBlock = latestBlock;

  while (low <= high) {
    await waitMilliseconds(2000);

    const mid = Math.floor((low + high) / 2);
    const block = await provider.getBlock(mid);

    if (!block) break;

    const blockTimestamp = block.timestamp;

    if (Math.abs(blockTimestamp - targetTimestamp) < Math.abs(closestBlock.timestamp - targetTimestamp)) {
      closestBlock = block;
    }

    if (blockTimestamp < targetTimestamp) {
      low = mid + 1;
    } else if (blockTimestamp > targetTimestamp) {
      high = mid - 1;
    } else {
      return block.number;
    }
  }

  return closestBlock.number;
}

async function v2TeslaSnapshot(d) {
  const ts = Math.floor(d.getTime() / 1000);
  const blockNumber = await findBlockByTimestamp(ts);

  const nStakers = await espaceABCV2contract.stakerNumber({ blockTag: blockNumber });

  console.log('snapshotDate,espaceAddr,posAmount,abcAmount,vote');
  const jsonList = [];
  const dStr = formatDate(d);

  for (let i = 1; i < nStakers; i++) {
    console.log('Processing staker', i, 'of', Number(nStakers) - 1);
    await waitMilliseconds(2000);

    const stakerAddr = await espaceABCV2contract.stakerAddress(i, { blockTag: blockNumber });
    const stakerAmt = await espaceABCV2contract.userSummary(stakerAddr, { blockTag: blockNumber });
    const stakerABCamt = await espaceABCcontract.balanceOf(stakerAddr, { blockTag: blockNumber });

    const npos = Math.floor(Number(stakerAmt[0]) / Number(5));
    const nabc = Math.floor(Number(stakerABCamt) / Number(gWei) / Number(188));

    jsonList.push({
      snapshotDate: dStr,
      espaceAddr: stakerAddr,
      posAmount: Number(stakerAmt[0] * 1000n),
      abcAmount: Number(stakerABCamt / gWei),
      vote: Math.min(npos, nabc)
    });
  }

  return jsonList;
}

async function main() {
  // Get target date from command line argument or use today
  const args = process.argv.slice(2);
  let targetDate;

  if (args[0]) {
    // Parse date in YYYYMMDD format
    const argDate = args[0];
    if (argDate.length === 8) {
      const year = parseInt(argDate.slice(0, 4), 10);
      const month = parseInt(argDate.slice(4, 6), 10) - 1;
      const day = parseInt(argDate.slice(6, 8), 10);
      targetDate = new Date(year, month, day);
    } else {
      targetDate = new Date(args[0]);
    }
  } else {
    targetDate = new Date();
  }

  targetDate.setHours(0, 0, 0, 0);

  // Only run on specific dates or every 15 days after 20250209
  const specificDates = ['20241021', '20241101', '20250110', '20250209'];
  const dateStr = formatDate(targetDate);

  const recurringStart = new Date(2025, 1, 9); // Feb 9, 2025
  recurringStart.setHours(0, 0, 0, 0);
  const daysDiff = Math.round((targetDate.getTime() - recurringStart.getTime()) / (1000 * 60 * 60 * 24));

  const isSpecificDate = specificDates.includes(dateStr);
  const isRecurringDate = daysDiff > 0 && daysDiff % 15 === 0;

  if (!isSpecificDate && !isRecurringDate) {
    console.log('Skipping', dateStr, '- not a scheduled snapshot date');
    return;
  }

  console.log('Fetching Tesla snapshot for', dateStr);

  let existingData = readExistingData();

  // Check if we already have data for this date
  const existingRecords = existingData.filter(item => item.snapshotDate === dateStr);
  if (existingRecords.length > 0) {
    console.log(`Found ${existingRecords.length} existing records for ${dateStr}. They will be updated.`);
  }

  try {
    const newRecords = await v2TeslaSnapshot(targetDate);
    console.log(`Fetched ${newRecords.length} staker records`);

    existingData = upsertRecords(existingData, newRecords, ['snapshotDate', 'espaceAddr']);
    writeData(existingData);

    console.log('Tesla snapshot collection complete');
  } catch (err) {
    console.error('Error fetching Tesla snapshot:', err.message);
    process.exit(1);
  }
}

main().catch(console.error);
