// Shared physical landmarks. Orders may reuse a storefront, room and customer.
export const start = { x: 0, z: 2.05 };
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
    name: '便民药店', mapLabel: '药店', storefront: '便民药店', door: { x: 10.55, z: -.61 },
    room: { ...smallRoom, template: 'pharmacy', name: '药店内堂' },
    staff: '兔药师', item: '药袋', note: '药袋请当面交给猫婆婆。',
    line: '阿柴，榕树里三号的药袋。猫婆婆在楼下等你呢。',
    actions: { ...commonActions, talk: '找兔药师取件', collect: '收好药袋', pack: '把药袋放进箱子', unpack: '从箱里取药袋' },
  },
  {
    ...firstDelivery, id: 'buns', label: '包子单', accept: '接下包子单', pickupPhase: '去取餐',
    name: '榕记包子铺', mapLabel: '榕记', storefront: '榕记包子铺', door: { x: -3.10, z: -.61 },
    room: { ...smallRoom, template: 'bakery', name: '包子铺内堂' },
    staff: '榕记师傅', item: '餐袋', note: '鲜肉包一份，请趁热送到。',
    line: '阿柴，猫婆婆订的鲜肉包刚出笼。我装好了，趁热给她送去吧。',
    actions: { ...commonActions, talk: '找师傅取餐', collect: '接过包子', pack: '把餐袋放进箱子', unpack: '从箱里取餐袋' },
  },
];

export function nextOrder(current, catalog = orders) {
  return catalog[(catalog.indexOf(current) + 1) % catalog.length];
}

export function formatPay(cents) {
  return '¥' + (cents / 100).toFixed(2);
}
