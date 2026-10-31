import { createTask, type Task, type TaskColor, type TaskFile } from './model';

export function demoFile(today = new Date()): TaskFile {
  const date = (offset: number, hour: number, minute = 0) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset, hour, minute).toISOString();
  const items: [string, string, number, number, number, number, TaskColor, string, boolean][] = [
    ['完成产品设计方案', '梳理核心使用流程，完成首页和任务详情页设计。\n\n· 整理用户反馈\n· 完善交互细节\n· 准备设计评审', -1, 9, 1, 18, 'sage', '工作', false],
    ['阅读《原子习惯》', '每天留出一点时间，读二十页书，记录一个有启发的观点。', 0, 8, 2, 21, 'amber', '学习', false],
    ['整理本周工作笔记', '回顾本周的项目进展，把零散的想法整理到思源笔记。', 0, 10, 0, 20, 'blue', '工作', false],
    ['周末去公园散步', '带上相机，放下手机，去户外走走。', 5, 9, 5, 12, 'violet', '生活', false],
    ['整理个人知识库', '归档旧笔记，完善标签和双向链接。', -2, 9, -1, 18, 'sage', '工作', true],
    ['给绿植浇水', '照顾阳台的植物。', -1, 8, 0, 9, 'violet', '生活', true],
    ['团队周会', '同步项目进度与下周计划。', 2, 14, 2, 15, 'sage', '工作', false],
    ['学习一个新技能', '用一小时时间，探索新的可能。', 4, 19, 4, 21, 'amber', '学习', false],
  ];
  return { version: 1, tasks: items.map(([title, details, sd, sh, ed, eh, color, category, completed]): Task => {
    const task = createTask({ title, details, start: date(sd, sh), end: date(ed, eh), color, category, remindMinutes: 15, remindStart: false }, date(-3, 9));
    return { ...task, completed, completedAt: completed ? date(-1, 17) : null, history: completed ? [...task.history, { at: date(-1, 17), action: 'completed' }] : task.history };
  }) };
}
