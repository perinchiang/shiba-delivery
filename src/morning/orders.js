import { heroLocalToWorld } from './coastal-town.js';

// Spawn right at the sunlit Haikaze-so coastal corner (clear of building & stairs, ready to ride or dismount).
export const start = Object.freeze({ x: 2.2, z: 11.4, yaw: 0.32 });

const ramenDoor = heroLocalToWorld(-0.4, -4.55, 0);
const hook201 = heroLocalToWorld(3.35, -0.80, 3.25);
const hook202 = heroLocalToWorld(3.35, 1.35, 3.25);

const commonActions = {
  phone: '查看新单',
  brake: '减速停车',
  statement: '查看到账',
  park: '停车下车',
  mount: '骑上小摩托',
  pack: '把餐袋放进箱子',
  unpack: '从箱里取餐袋',
  sign: '确认签收',
};

export const orders = [
  {
    id: 'ramen201',
    label: '海风拉面 · 201 室',
    accept: '接下海风拉面单',
    pickupPhase: '去取拉面',
    pickupMode: 'curbside',
    pickupArea: '海风庄 1F',
    name: '海风拉面',
    mapLabel: '海风拉面',
    door: { x: ramenDoor.x, z: ramenDoor.z },
    staff: '拉面店老板',
    item: '豚骨拉面',
    feeCents: 420,
    insuranceCents: 0,
    clock: { offer: '08:10', pickup: '08:12', delivery: '08:15', done: '08:17' },
    note: '热腾腾的海风拉面，走西侧外挂铁楼梯送到二楼 201 门口外卖挂钩。',
    line: '阿柴来得正好！201 室要的招牌海风拉面刚出锅，端稳些走外楼梯上去，挂门口挂钩就行。',
    receiptNote: '“热汤一点没洒，二楼的风吹着真舒服。”',
    customer: {
      name: '201 室住户',
      address: '海风庄 2F · 201 室',
      mapLabel: '海风庄 201',
      point: { x: hook201.x, z: hook201.z },
      onUpperFloor: true,
      instructions: '走外挂铁楼梯上二楼，挂在 201 门口挂钩',
      line: '太快啦！隔着窗帘就闻到拉面香味了，辛苦阿柴爬楼梯！',
    },
    actions: {
      ...commonActions,
      talk: '在海风拉面取餐',
      collect: '接过豚骨拉面',
      deliver: '挂到 201 门口挂钩',
    },
  },
  {
    id: 'ramenSeawall',
    label: '冷面 · 观海栈台',
    accept: '接下观海冷面单',
    pickupPhase: '去取冷面',
    pickupMode: 'curbside',
    pickupArea: '海风庄 1F',
    name: '海风拉面',
    mapLabel: '海风拉面',
    door: { x: ramenDoor.x, z: ramenDoor.z },
    staff: '拉面店老板',
    item: '海风冷面',
    feeCents: 560,
    insuranceCents: 0,
    clock: { offer: '08:22', pickup: '08:24', delivery: '08:29', done: '08:32' },
    note: '冰镇海风冷面两份，骑下海滨大道送到观海栈台长椅旁。',
    line: '这两份海风冷面加了冰块，放保温箱里稳当，骑过前面铁道口就能看到海滨栈台啦！',
    receiptNote: '“迎着海风跑一趟，冷面还是冰冰凉的。”',
    customer: {
      name: '海边写生画师',
      address: '海滨大道 · 观海栈台',
      mapLabel: '观海栈台',
      point: { x: 13.5, z: 52.6 },
      onUpperFloor: false,
      instructions: '骑过海岸铁道口到海滨大道南侧栈台',
      line: '正好画完海面高光，冰镇冷面来得太及时了，谢谢阿柴！',
    },
    actions: {
      ...commonActions,
      talk: '在海风拉面取餐',
      collect: '接过海风冷面',
      deliver: '递给海边画师',
    },
  },
  {
    id: 'ramen202',
    label: '海风拉面 · 202 室',
    accept: '接下 202 室单',
    pickupPhase: '去取餐',
    pickupMode: 'curbside',
    pickupArea: '海风庄 1F',
    name: '海风拉面',
    mapLabel: '海风拉面',
    door: { x: ramenDoor.x, z: ramenDoor.z },
    staff: '拉面店老板',
    item: '酱油拉面',
    feeCents: 450,
    insuranceCents: 0,
    clock: { offer: '08:40', pickup: '08:42', delivery: '08:45', done: '08:47' },
    note: '招牌酱油拉面配溏心蛋，送到二楼走廊尽头 202 室。',
    line: '202 室的酱油拉面打包好啦，上完铁楼梯顺着走廊就能看到 202 蓝色门牌。',
    receiptNote: '“楼上楼下都认熟路了！”',
    customer: {
      name: '202 室住户',
      address: '海风庄 2F · 202 室',
      mapLabel: '海风庄 202',
      point: { x: hook202.x, z: hook202.z },
      onUpperFloor: true,
      instructions: '上外挂铁楼梯进二楼走廊，送到 202 门口',
      line: '谢谢阿柴！海风庄住二楼点楼下拉面真是太幸福啦。',
    },
    actions: {
      ...commonActions,
      talk: '在海风拉面取餐',
      collect: '接过酱油拉面',
      deliver: '挂到 202 门口挂钩',
    },
  },
];

export function nextOrder(current, catalog = orders) {
  return catalog[(catalog.indexOf(current) + 1) % catalog.length];
}

export function formatPay(cents) {
  return '¥' + (cents / 100).toFixed(2);
}
