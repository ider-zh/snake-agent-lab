import {lessons} from './content';
export const chapters=[
 {group:'01 / 经典策略',title:'从一次移动开始',description:'用四种简单策略建立直觉：动作如何产生，眼前合法与长期生存有什么区别。'},
 {group:'02 / 搜索决策',title:'从地图到行动',description:'比较搜索顺序、前瞻预算和身体运动，理解一条候选路径如何成为实际动作。'},
 {group:'03 / 学习与证据',title:'从经验到策略',description:'把观察编码成数据，追踪参数更新，再用独立评估判断学到了什么。'},
];
export const objectives:Record<string,string[]>={
 random:['区分抽样方向与实际执行动作','用固定随机输入复现一次抽样'],
 'legal-random':['根据身体与尾格释放筛选合法动作','解释单步合法为何仍可能被困'],
 greedy:['计算四邻格的曼哈顿距离','识别距离指标忽略的地图信息'],
 'safe-greedy':['追踪洪泛填充得到的空间','区分局部安全启发式与轨迹证明'],
 bfs:['按 FIFO 顺序展开 frontier','从父节点还原静态最短路径'],
 astar:['分别计算 g、h 与 f','比较启发式如何改变扩展顺序'],
 dijkstra:['用累计代价 g 排序候选','解释单位边权下与 BFS 的联系'],
 'best-first':['观察仅按 h 排序的搜索过程','区分最佳优先与单步贪心'],
 beam:['观察有限宽度如何筛选动态路线','解释剪枝和深度预算的取舍'],
 mcts:['计算 UCT 的探索与利用项','读取根节点访问数和叶价值'],
 hamiltonian:['识别可构造覆盖环的棋盘','解释沿环身体顺序如何保留出口'],
 'hamiltonian-shortcut':['计算环上的前向距离','验证捷径前后的身体环序'],
 'tail-safe':['构造通向尾格的绕行路径','跟踪增长对尾格释放的影响'],
 encoding:['把同一观察映射成 12 个特征','识别局部编码丢失的身体信息'],
 'q-learning':['手算一次最大 Q 值的 TD 更新','区分训练探索与冻结推理'],
 sarsa:['使用实际下一动作计算目标','解释待执行动作为何属于检查点'],
 dqn:['比较 DQN 与 Double DQN 的目标','追踪 online 和 target 网络的分工'],
 ga:['读懂共同种子下的适应度','区分进化选择与独立测试'],
 ppo:['计算正负优势下的裁剪目标','连接 rollout、GAE 与参数更新'],
 imitation:['计算教师标签的交叉熵','区分教师一致率与学生自主表现'],
 evaluation:['比较均值、中位数与失败分布','建立训练、验证和测试的边界'],
};
export const lessonHref=(id?:string)=>`#/lessons${id?`/${id}`:''}`;
export function lessonIdFromHash(hash:string):string|null {
 const match=/^#\/lessons\/([^/?#]+)\/?$/.exec(hash);
 return match&&lessons.some(l=>l.id===match[1])?match[1]:null;
}
export function lessonNeighbors(id:string){const i=lessons.findIndex(l=>l.id===id);return {previous:i>0?lessons[i-1]:null,next:i>=0&&i<lessons.length-1?lessons[i+1]:null};}
