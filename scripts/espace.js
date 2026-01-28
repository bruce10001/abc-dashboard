import { Contract, JsonRpcProvider } from 'ethers';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const CONFIG = require('./config.json');
const { espaceV2abi } = require('./abi/v2.json');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_FILE = path.join(__dirname, '..', 'data', 'poolStats.json');

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

function upsertRecord(existingData, newRecord, keyCols) {
  const index = existingData.findIndex(item =>
    keyCols.every(key => item[key] === newRecord[key])
  );
  if (index >= 0) {
    existingData[index] = newRecord;
    console.log('Updated existing record for', keyCols.map(k => newRecord[k]).join(', '));
  } else {
    existingData.push(newRecord);
    console.log('Added new record for', keyCols.map(k => newRecord[k]).join(', '));
  }
  return existingData;
}

const provider = new JsonRpcProvider(CONFIG.eSpaceUrl);
const espaceABCV2contract = new Contract(CONFIG.ABCV2PoolEspaceContractAddr, espaceV2abi, provider);
const espaceABCV1contract = new Contract(CONFIG.ABCV1EspacePoolContractAddr, espaceV2abi, provider);

async function findBlockByTimestamp(targetTimestamp) {
  let latestBlock = await provider.getBlock("latest");
  let latestBlockNumber = latestBlock.number;

  let low = 0;
  let high = latestBlockNumber;
  let closestBlock = latestBlock;

  while (low <= high) {
    await waitMilliseconds(200);

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

async function withRetry(fn, args = [], retries = 3, delay = 1000) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn(...args);
    } catch (err) {
      lastError = err;
      console.warn(`Retry [${i + 1}/${retries}]: ${err.message}`);
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

async function abcEspacePoolStats(d, version) {
  const ts = Math.floor(d.getTime() / 1000);
  const blockNumber = await findBlockByTimestamp(ts);
  console.log('Block number found:', blockNumber);

  let nStakers, stakerAmt, npos;

  if (version === 'v2') {
    nStakers = await espaceABCV2contract.stakerNumber({ blockTag: blockNumber });
    stakerAmt = await espaceABCV2contract.poolSummary({ blockTag: blockNumber });
    npos = Number(stakerAmt[0]);
  } else {
    nStakers = await espaceABCV1contract.stakerNumber({ blockTag: blockNumber });
    stakerAmt = await espaceABCV1contract.poolSummary({ blockTag: blockNumber });
    npos = Number(stakerAmt[0]);
  }

  console.log('Done one date', d);
  return {
    snapshotDate: formatDate(d),
    epochNumber: Number(blockNumber),
    chain: 'espace',
    version: version,
    stakerNumber: Number(nStakers),
    totalPOS: Number(npos)
  };
}

async function main() {
  const args = process.argv.slice(2);
  let targetDate;

  if (args[0]) {
    const dateStr = args[0];
    if (dateStr.length === 8) {
      const year = parseInt(dateStr.slice(0, 4), 10);
      const month = parseInt(dateStr.slice(4, 6), 10) - 1;
      const day = parseInt(dateStr.slice(6, 8), 10);
      targetDate = new Date(year, month, day);
    } else {
      targetDate = new Date(args[0]);
    }
  } else {
    targetDate = new Date();
  }

  targetDate.setHours(0, 0, 0, 0);

  // Only run on 1st, 11th, 21st of each month
  const day = targetDate.getDate();
  if (day !== 1 && day !== 11 && day !== 21) {
    console.log('Skipping', formatDate(targetDate), '- not 1st, 11th, or 21st');
    return;
  }

  const dateStr = formatDate(targetDate);
  console.log('Fetching eSpace data for', dateStr);

  let existingData = readExistingData();

  // Fetch V1 data
  console.log('Fetching eSpace V1 data...');
  try {
    const record = await withRetry(abcEspacePoolStats, [targetDate, 'v1'], 3, 2000);
    if (!Number.isNaN(record.stakerNumber)) {
      existingData = upsertRecord(existingData, record, ['snapshotDate', 'version', 'chain']);
      writeData(existingData);
    }
  } catch (err) {
    console.error('Error fetching V1 data:', err.message);
  }

  // Fetch V2 data
  console.log('Fetching eSpace V2 data...');
  try {
    const record = await withRetry(abcEspacePoolStats, [targetDate, 'v2'], 3, 2000);
    if (!Number.isNaN(record.stakerNumber)) {
      existingData = upsertRecord(existingData, record, ['snapshotDate', 'version', 'chain']);
      writeData(existingData);
    }
  } catch (err) {
    console.error('Error fetching V2 data:', err.message);
  }

  console.log('eSpace data collection complete');
}

main().catch(console.error);
