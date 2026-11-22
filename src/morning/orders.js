import { rideMinZ } from './street-layout.js';

// Shared physical landmarks. Orders may reuse a storefront, room and customer.
export const start = { x: 0, z: rideMinZ + .16 };
export const bunFacade = { x: -5, z: .2 };
const smallRoom = { counter: { x: .37, z: -.02 }, exit: { x: 0, z: 2.40 } };
const customer = {
  name: '猫婆婆', address: '榕树里 3 号', mapLabel: '榕树里', point: { x: 28.15, z: -.88 },
  instructions: '猫婆婆在楼下等', line: '到啦？辛苦你起这么早。来，歇口气再走。',
};
export { customer as streetResident };

const firstDelivery = {
  customer, feeCents: 310, insuranceCents: 300, receiptNote: '“开张了，一毛也是热乎的。”',
  clock: { offer: '07:12', pickup: '07:14', delivery: '07:20', done: '07:24' },
};
const commonActions = {
  phone: '查看新单', brake: '减速停车', statement: '查看到账', park: '停车下车', mount: '骑上小摩托',
  enter: '推门进店', exit: '推门出去', deliver: '递给猫婆婆', sign: '确认签收',
};

export const orders = [
  {
    ...firstDelivery, id: 'pharmacy', label: '药店单', accept: '接下第一单', pickupPhase: '去取件',
    pickupMode: 'indoor', pickupArea: '榕湾老街',
    name: '便民药店', mapLabel: '药店', storefront: '便民药店', door: { x: 10.55, z: -.61 },
    room: { ...smallRoom, template: 'pharmacy', name: '药店内堂' },
    staff: '兔药师', item: '药袋', note: '药袋请当面交给猫婆婆。',
    line: '阿柴，榕树里三号的药袋。猫婆婆在楼下等你呢。',
    actions: { ...commonActions, talk: '找兔药师取件', collect: '收好药袋', pack: '把药袋放进箱子', unpack: '从箱里取药袋' },
  },
  {
    ...firstDelivery, id: 'buns', label: '包子单', accept: '接下包子单', pickupPhase: '去取餐',
    pickupMode: 'indoor', pickupArea: '榕湾老街',
    name: '榕记包子铺', mapLabel: '榕记', storefront: '榕记包子铺', door: { x: -3.10, z: -.61 },
    room: { ...smallRoom, template: 'bakery', name: '包子铺内堂' },
    staff: '榕记师傅', item: '餐袋', note: '鲜肉包一份，请趁热送到。',
    line: '阿柴，猫婆婆订的鲜肉包刚出笼。我装好了，趁热给她送去吧。',
    actions: { ...commonActions, talk: '找师傅取餐', collect: '接过包子', pack: '把餐袋放进箱子', unpack: '从箱里取餐袋' },
  },
  {
    id: 'ice', label: '冰室单', accept: '接下冰室单', pickupPhase: '去取餐',
    cityRoute: true, pickupMode: 'curbside', pickupArea: '榕湾中路 · 东南角',
    name: '南方冰室', mapLabel: '南方冰室', storefront: '南方冰室', door: { x: 103.5, z: 10.7 },
    room: { ...smallRoom, template: 'pharmacy', name: '南方冰室' },
    staff: '阿柠熊', item: '冻柠茶',
    feeCents: 550, insuranceCents: 0, receiptNote: '“跨街单到手，冰块一点没化。”',
    clock: { offer: '07:28', pickup: '07:30', delivery: '07:35', done: '07:39' },
    note: '两杯少冰冻柠茶配菠萝油，送回老街榕树里 3 号。',
    line: '阿柴来得正好！两杯少冰冻柠茶配菠萝油刚打好包，趁冰块没化送回老街给猫婆婆吧。',
    customer: { ...customer, line: '呀，大老远从十字路口冰室捎回来的？辛苦啦，快喝口水歇歇。' },
    actions: { ...commonActions, talk: '找阿柠熊取餐', collect: '接过冻柠茶', pack: '把冻柠茶放进箱子', unpack: '从箱里取冻柠茶' },
  },
  {
    id: 'tea', label: '茶行单', accept: '接下茶行单', pickupPhase: '去取件',
    cityRoute: true, pickupMode: 'curbside', pickupArea: '榕湾中路 · 西南角',
    name: '海棠茶行', mapLabel: '海棠茶行', storefront: '海棠茶行', door: { x: 80.5, z: 10.7 },
    room: { ...smallRoom, template: 'pharmacy', name: '海棠茶行' },
    staff: '棠姨鹿', item: '茶礼盒',
    feeCents: 620, insuranceCents: 0, receiptNote: '“横街也认熟路了，茶香还热乎。”',
    clock: { offer: '07:42', pickup: '07:44', delivery: '07:49', done: '07:53' },
    note: '新焙凤凰单丛，转进北横街送到榕湾里 8 号楼下。',
    line: '新焙好的凤凰单丛装好啦，帮我送到北边横街榕湾里 8 号楼下，龟伯正等着泡早茶呢。',
    customer: {
      name: '龟伯', address: '北横街 · 榕湾里 8 号', mapLabel: '榕湾里8号',
      point: { x: 85.6, z: -24.0 }, instructions: '龟伯在北横街楼下等',
      line: '慢骑慢骑，茶香隔老远就闻见啦。今天风挺舒服吧？',
    },
    actions: { ...commonActions, talk: '找棠姨鹿取件', collect: '接过茶礼盒', pack: '把茶礼盒放进箱子', unpack: '从箱里取茶礼盒', deliver: '递给龟伯' },
  },
  {
    id: 'books', label: '书局单', accept: '接下书局单', pickupPhase: '去取件',
    cityRoute: true, pickupMode: 'curbside', pickupArea: '榕湾中路 · 西北角',
    name: '春风书局', mapLabel: '春风书局', storefront: '春风书局', door: { x: 80.5, z: -2.35 },
    room: { ...smallRoom, template: 'pharmacy', name: '春风书局' },
    staff: '文叔獾', item: '旧画册',
    feeCents: 580, insuranceCents: 0, receiptNote: '“画册没折角，小狐画师给了一个大赞。”',
    clock: { offer: '07:56', pickup: '07:58', delivery: '08:03', done: '08:07' },
    note: '一捆旧画册，转进南横街送到青禾寓 5 号楼下。',
    line: '这一捆旧画册刚捆好，帮我顺手捎去南边横街青禾寓，小狐画师今天赶稿出不了门。',
    customer: {
      name: '小狐画师', address: '南横街 · 青禾寓 5 号', mapLabel: '青禾寓5号',
      point: { x: 98.4, z: 32.0 }, instructions: '小狐画师在南横街楼下等',
      line: '太及时啦！正缺这几本配色参考呢，下次请你喝南方冰室的冻柠茶！',
    },
    actions: { ...commonActions, talk: '找文叔獾取件', collect: '接过旧画册', pack: '把旧画册放进箱子', unpack: '从箱里取旧画册', deliver: '递给小狐画师' },
  },
];

export const isCityOrder = order => Boolean(order?.cityRoute);

export function nextOrder(current, catalog = orders) {
  return catalog[(catalog.indexOf(current) + 1) % catalog.length];
}

export function formatPay(cents) {
  return '¥' + (cents / 100).toFixed(2);
}
