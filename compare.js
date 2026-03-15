const XLSX = require('./node_modules/xlsx');

function readFile(path) {
  const wb = XLSX.readFile(path);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
  const headers = rows[0];
  const data = rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return { headers, data };
}

const manual = readFile('06(1).xlsx');
const algo = readFile('排单结果_20260311.xlsx');

console.log('=== ROW COUNTS ===');
console.log('Manual orders:', manual.data.length);
console.log('Algo orders:', algo.data.length);

console.log('\n=== MANUAL HEADERS ===');
console.log(manual.headers.join(' | '));
console.log('\n=== ALGO HEADERS ===');
console.log(algo.headers.join(' | '));

// Build maps by order number
const manualMap = {};
manual.data.forEach(r => { if (r['订单号']) manualMap[r['订单号']] = r; });
const algoMap = {};
algo.data.forEach(r => { if (r['订单号']) algoMap[r['订单号']] = r; });

const allOrders = new Set([...Object.keys(manualMap), ...Object.keys(algoMap)]);

// Compare driver assignments
let sameDriver = 0, diffDriver = 0, onlyInManual = 0, onlyInAlgo = 0;
const diffs = [];
const onlyManual = [];
const onlyAlgo = [];

allOrders.forEach(orderNo => {
  const m = manualMap[orderNo];
  const a = algoMap[orderNo];
  if (m && a) {
    if (m['司机'] === a['司机']) {
      sameDriver++;
    } else {
      diffDriver++;
      diffs.push({
        orderNo,
        serviceDate: m['服务日期'],
        vehicleType: m['预订车型'],
        serviceType: m['服务类型'],
        manualDriver: m['司机'],
        manualPlate: m['车号'],
        algoDriver: a['司机'],
        algoPlate: a['车号'],
      });
    }
  } else if (m && !a) {
    onlyInManual++;
    onlyManual.push({ orderNo, driver: m['司机'], date: m['服务日期'] });
  } else {
    onlyInAlgo++;
    onlyAlgo.push({ orderNo, driver: a['司机'], date: a['服务日期'] });
  }
});

console.log('\n=== DRIVER ASSIGNMENT COMPARISON ===');
console.log('Same driver assigned:', sameDriver);
console.log('Different driver assigned:', diffDriver);
console.log('Only in manual:', onlyInManual);
console.log('Only in algo:', onlyInAlgo);

console.log('\n=== ORDERS WITH DIFFERENT DRIVERS (first 20) ===');
diffs.slice(0, 20).forEach(d => {
  console.log(d.orderNo, d.serviceDate, d.vehicleType, d.serviceType);
  console.log('  Manual:', d.manualDriver, d.manualPlate);
  console.log('  Algo:  ', d.algoDriver, d.algoPlate);
});

if (onlyManual.length > 0) {
  console.log('\n=== ONLY IN MANUAL (first 10) ===');
  onlyManual.slice(0, 10).forEach(o => console.log(o.orderNo, o.driver, o.date));
}
if (onlyAlgo.length > 0) {
  console.log('\n=== ONLY IN ALGO (first 10) ===');
  onlyAlgo.slice(0, 10).forEach(o => console.log(o.orderNo, o.driver, o.date));
}

// Driver workload comparison
console.log('\n=== MANUAL: DRIVER WORKLOAD ===');
const manualWorkload = {};
manual.data.forEach(r => {
  const d = r['司机'] || 'UNASSIGNED';
  manualWorkload[d] = (manualWorkload[d] || 0) + 1;
});
Object.entries(manualWorkload).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(k + ': ' + v));

console.log('\n=== ALGO: DRIVER WORKLOAD ===');
const algoWorkload = {};
algo.data.forEach(r => {
  const d = r['司机'] || 'UNASSIGNED';
  algoWorkload[d] = (algoWorkload[d] || 0) + 1;
});
Object.entries(algoWorkload).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(k + ': ' + v));
