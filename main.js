/* ==========================================================================
 * Jensen 科研工作站 v0.4.0 —— 应用壳层版
 *
 * 本版对标 Research OS 的应用骨架（源码级对齐）：
 *   左侧栏（品牌 + 区段导航 + 库统计）· 区段 Topbar（大标题/副标题/搜索/主按钮）
 *   区段：总览看板 / AI 发现 / 阅读队列 / 文献库 / 论文图谱 / 研究进展 / 阅读笔记
 * 保留 v0.3 全部能力：自由拖拽看板、卡片配置、外观工作室、Bases、AI 全家桶、MinerU。
 * 致谢：Hearth (MIT) / Research OS (MIT)
 * ========================================================================== */

'use strict';

const {
  Plugin, ItemView, Modal, Notice, PluginSettingTab, Setting, TFile,
  normalizePath, setIcon, requestUrl, MarkdownRenderer,
} = require('obsidian');

/* ---------- 常量 ---------- */

const VIEW_DASHBOARD = 'jrs-dashboard';
const VIEW_LIBRARY = 'jrs-library';
const VIEW_SIDE = 'jrs-sidepanel';

const STATUSES = ['待读', '阅读中', '已完成', '已归档'];
const PRIORITIES = ['高', '中', '低'];

const ROW_H = 96;
const DEFAULT_COLS = 6;

const ACCENTS = {
  blue: { name: '科研蓝', hex: '#4c7def' },
  indigo: { name: '深空靛', hex: '#6366f1' },
  teal: { name: '深空青', hex: '#0d9488' },
  violet: { name: '星云紫', hex: '#8b5cf6' },
  amber: { name: '暖阳橙', hex: '#d97706' },
  rose: { name: '星尘红', hex: '#e11d48' },
};

const DEFAULT_TOPICS = [
  '卫星任务规划', '时空网格', '网格热力图', '区域目标覆盖',
  '成像卫星', '敏捷卫星', '电磁探测卫星', '巨星座', '天临空协同',
  '元启发式算法', '进化算法', '深度强化学习', '大模型驱动', '在轨自主', '任务生成',
];

/** 区段定义（对标 OS 的 sidebar nav + topbar titles） */
const SECTIONS = [
  { id: 'home', icon: 'orbit', label: '总览', title: '总览', sub: '今天的科研节奏，一屏掌握' },
  { id: 'discover', icon: 'sparkles', label: 'AI 发现', title: 'AI 论文发现', sub: '按关键词检索 arXiv 最新论文，一键入库' },
  { id: 'queue', icon: 'list-checks', label: '阅读队列', title: '阅读队列', sub: '明确下一篇，保持阅读节奏' },
  { id: 'library', icon: 'library', label: '文献库', title: '文献库', sub: '收集、搜索、分类与管理阅读状态' },
  { id: 'graph', icon: 'git-fork', label: '论文图谱', title: '论文图谱', sub: '探索论文与研究方向之间的联系' },
  { id: 'progress', icon: 'sprout', label: '研究进展', title: '研究进展', sub: '把读过的论文转化为判断与下一步' },
  { id: 'reader', icon: 'book-open', label: '阅读笔记', title: '阅读笔记', sub: '分栏精读：笔记 + PDF + AI 助手' },
  { id: 'submit', icon: 'target', label: '投稿冲刺', title: '投稿冲刺', sub: '目标期刊速查 · 投稿管线 · 截稿倒计时' },
  { id: 'ask', icon: 'bot', label: '知识问答', title: '知识问答', sub: '基于你的文献库回答，来源可溯源（ima 式）' },
];

/** 目标期刊库（EJOR 等运筹学顶刊 + 航天/卫星领域核心刊） */
const JOURNALS = [
  { abbr: 'EJOR', name: 'European Journal of Operational Research', field: '运筹学', tag: '顶刊', publisher: 'Elsevier', match: '调度/优化方法+充分实验', link: 'https://www.editorialmanager.com/ejor/', note: '偏方法严谨与计算实验，规划类综述与方法类论文均常见', cas: '1区', jcr: 'Q1', tier: 'A' },
  { abbr: 'OR', name: 'Operations Research', field: '运筹学', tag: '顶刊', publisher: 'INFORMS', match: '理论深度/算法贡献', link: 'https://pubsonline.informs.org/journal/opre', note: 'INFORMS 旗舰，理论要求高', cas: '2区', jcr: 'Q1', tier: 'A' },
  { abbr: 'INFORMS JoC', name: 'INFORMS Journal on Computing', field: '运筹/计算', tag: '顶刊', publisher: 'INFORMS', match: '元启发式/进化算法/学习+优化', link: 'https://pubsonline.informs.org/journal/ijoc', note: '算法与计算实验导向，适合智能调度算法', cas: '2区', jcr: 'Q1', ccf: 'B', tier: 'A' },
  { abbr: 'C&OR', name: 'Computers & Operations Research', field: '运筹/计算', tag: '主流', publisher: 'Elsevier', match: '调度算法/组合优化应用', link: 'https://www.editorialmanager.com/caor/', note: '应用型算法文友好', cas: '2区', jcr: 'Q1', tier: 'B' },
  { abbr: 'Omega', name: 'Omega - The International Journal of Management Science', field: '运筹/管理', tag: '顶刊', publisher: 'Elsevier', match: '决策支持/应用驱动', link: 'https://www.editorialmanager.com/omega/', note: '强调应用价值与管理洞察', cas: '1区', jcr: 'Q1', tier: 'B' },
  { abbr: 'Networks', name: 'Networks', field: '图论/网络', tag: '主流', publisher: 'Wiley', match: '网络流/图模型', link: 'https://onlinelibrary.wiley.com/journal/10970037', note: '网络结构建模对口', cas: '3区', jcr: 'Q2' },
  { abbr: 'AST', name: 'Aerospace Science and Technology', field: '航空航天', tag: '顶刊', publisher: 'Elsevier', match: '卫星任务规划/星座调度', link: 'https://www.editorialmanager.com/aescte/', note: '航天技术与系统，卫星规划高频期刊', cas: '1区', jcr: 'Q1', tier: 'T3' },
  { abbr: 'AA', name: 'Acta Astronautica', field: '航天', tag: '顶刊', publisher: 'Elsevier', match: '任务规划/在轨系统', link: 'https://www.editorialmanager.com/actaastro/', note: 'IAA 期刊，航天任务与系统工程', cas: '2区', jcr: 'Q1', tier: 'T1' },
  { abbr: 'ASR', name: 'Advances in Space Research', field: '航天', tag: '主流', publisher: 'Elsevier', match: '对地观测/星座应用', link: 'https://www.editorialmanager.com/asesre/', note: 'COSPAR 期刊，观测任务方向', cas: '3区', jcr: 'Q2', tier: 'T3' },
  { abbr: 'IEEE TAES', name: 'IEEE Trans. Aerospace and Electronic Systems', field: '航空电子', tag: '顶刊', publisher: 'IEEE', match: '调度系统/探测系统', link: 'https://ieee.atyponrex.com/journal/taes', note: '电子系统+任务规划结合', cas: '2区', jcr: 'Q1', tier: 'T1' },
  { abbr: 'IEEE TSMC', name: 'IEEE Trans. Systems, Man, and Cybernetics: Systems', field: '系统工程', tag: '顶刊', publisher: 'IEEE', match: '智能调度系统', link: 'https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=6221021', note: '系统智能方法', cas: '1区', jcr: 'Q1', tier: 'B' },
  { abbr: 'JAIS', name: 'Journal of Aerospace Information Systems', field: '航天信息', tag: '主流', publisher: 'AIAA', match: '规划信息系统', link: 'https://arc.aiaa.org/journal/jais', note: 'AIAA 信息系系统方向', cas: '3区', jcr: 'Q2', tier: 'T3' },
  { abbr: '宇航学报', name: '宇航学报', field: '航天(中文)', tag: 'EI/中文核心', publisher: '中国宇航学会', match: '卫星任务规划主阵地', link: '', note: '国内卫星规划领域核心发表阵地', cas: 'EI', jcr: '', tier: 'T1' },
  { abbr: '航空学报', name: '航空学报', field: '航空(中文)', tag: 'EI/中文核心', publisher: '中国航空学会', match: '飞行器/任务系统', link: '', note: '国内航空领域旗舰', cas: 'EI', jcr: '', tier: 'T1' },
  { abbr: '系统工程与电子技术', name: '系统工程与电子技术', field: '系统工程(中文)', tag: 'EI/中文核心', publisher: '中国航天科工', match: '调度/优化应用', link: '', note: '系统工程应用，周期较快', cas: 'EI', jcr: '', tier: 'T2' },
  { abbr: 'TEVC', name: 'IEEE Transactions on Evolutionary Computation', field: '进化计算', tag: '顶刊', publisher: 'IEEE', match: '进化算法/调度应用', link: 'https://ieee.atyponrex.com/journal/tevc', note: '进化算法方向首选，CCF-B · 科协B', cas: '1区', jcr: 'Q1', ccf: 'B', tier: 'B' },
  { abbr: 'J.Sched', name: 'Journal of Scheduling', field: '调度', tag: '主流', publisher: 'Wiley', match: '调度理论/卫星调度应用', link: 'https://onlinelibrary.wiley.com/journal/10999143', note: '调度专题刊，科协B · 运筹与管理', cas: '3区', jcr: 'Q2', tier: 'B' },
];

const SUB_STATUSES = ['写作中', '准备投稿', '已投', '审稿中', '大修', '小修', '已接收', '已拒稿', '改投'];

/* 内置期刊分级数据：CCF第七版(2026) 680条 · 科协运筹与管理56条 · 科协航空航天62条 · 预警2025 —— 数据整理自公开目录 */
const JOURNAL_BUILTIN = {"ccf":[["Journal of the ACM","JACM","A","journal","交叉/综合/新兴"],["Proceedings of the IEEE","Proc. IEEE","A","journal","交叉/综合/新兴"],["Science China-Information Sciences","SCIS","A","journal","交叉/综合/新兴"],["Bioinformatics","Bioinformatics","A","journal","交叉/综合/新兴"],["Briefings in Bioinformatics","","B","journal","交叉/综合/新兴"],["Cognition","Cognition","B","journal","交叉/综合/新兴"],["IEEE Transactions on Automation Science and Engineering","TASAE","B","journal","交叉/综合/新兴"],["IEEE Transactions on Geoscience and Remote Sensing","TGARS","B","journal","交叉/综合/新兴"],["IEEE Transactions on Intelligent Transportation Systems","TITS","B","journal","交叉/综合/新兴"],["IEEE Transactions on Medical Imaging","TMI","B","journal","交叉/综合/新兴"],["IEEE Transactions on Robotics","TR","B","journal","交叉/综合/新兴"],["IEEE-ACM Transactions on Computational Biology and Bioinformatics","TCBB","B","journal","交叉/综合/新兴"],["Journal of Computer Science and Technology","JCST","B","journal","交叉/综合/新兴"],["Journal of the American Medical Informatics Association","JAMIA","B","journal","交叉/综合/新兴"],["PLOS Computational Biology","","B","journal","交叉/综合/新兴"],["Computer Journal","","B","journal","交叉/综合/新兴"],["World Wide Web-Internet and Web Information Systems","WWW","B","journal","交叉/综合/新兴"],["Frontiers of Computer Science","FCS","B","journal","交叉/综合/新兴"],["Blockchain: Research and Applications","BCRA","B","journal","交叉/综合/新兴"],["BMC Bioinformatics","","C","journal","交叉/综合/新兴"],["Cybernetics and Systems","","C","journal","交叉/综合/新兴"],["IEEE Geoscience and Remote Sensing Letters","","C","journal","交叉/综合/新兴"],["IEEE Journal of Biomedical and Health Informatics","JBHI","C","journal","交叉/综合/新兴"],["IEEE Transactions on Big Data","TBD","C","journal","交叉/综合/新兴"],["IET Intelligent Transport Systems","","C","journal","交叉/综合/新兴"],["Journal of Biomedical Informatics","JBI","C","journal","交叉/综合/新兴"],["Medical Image Analysis","","C","journal","交叉/综合/新兴"],["IEEE Transactions on Industrial Informatics","TII","C","journal","交叉/综合/新兴"],["ACM Transactions on Cyber-Physical Systems","TCPS","C","journal","交叉/综合/新兴"],["ACM Transactions on Computing Education","TOCE","C","journal","交叉/综合/新兴"],["Frontiers of Information Technology & Electronic Engineering","FITEE","C","journal","交叉/综合/新兴"],["IEEE Transactions on Computational Social Systems","TCSS","C","journal","交叉/综合/新兴"],["IEEE Transactions on Reliability","","C","journal","交叉/综合/新兴"],["ACM Transactions on Computing for Healthcare","HEALTH","C","journal","交叉/综合/新兴"],["ACM Distributed Ledger Technologies: Research and  Practice","ACM DLT","C","journal","交叉/综合/新兴"],["International World Wide Web Conference","WWW","A","conf","交叉/综合/新兴"],["IEEE Real-Time Systems Symposium","RTSS","A","conf","交叉/综合/新兴"],["Annual Meeting of the Cognitive Science Society","CogSci","B","conf","交叉/综合/新兴"],["IEEE International Conference on Bioinformatics and Biomedicine","BIBM","B","conf","交叉/综合/新兴"],["International Conference on Embedded Software","EMSOFT","B","conf","交叉/综合/新兴"],["International conference on Intelligent Systems for Molecular Biology","ISMB","B","conf","交叉/综合/新兴"],["Annual International Conference on Research inComputational Molecular Biology","RECOMB","B","conf","交叉/综合/新兴"],["International Conference on Medical Image Computing and Computer-Assisted Intervention","MICCAI","B","conf","交叉/综合/新兴"],["Conference on Web and Internet Economics","WINE","B","conf","交叉/综合/新兴"],["American Medical Informatics Association Annual Symposium","AMIA","C","conf","交叉/综合/新兴"],["Asia Pacific Bioinformatics Conference","APBC","C","conf","交叉/综合/新兴"],["IEEE International Conference on Big Data","IEEE BigData","C","conf","交叉/综合/新兴"],["IEEE International Conference on Cloud Computing","IEEE CLOUD","C","conf","交叉/综合/新兴"],["IEEE International Conference on Systems, Man, and Cybernetics","SMC","C","conf","交叉/综合/新兴"],["International Conference on Spatial Information Theory","COSIT","C","conf","交叉/综合/新兴"],["International Symposium on Bioinformatics Research and Applications","ISBRA","C","conf","交叉/综合/新兴"],["International Symposium on Algorithmic Game Theory","SAGT","C","conf","交叉/综合/新兴"],["ACM Special Interest Group on Spatial Information","SIGSPATIAL","C","conf","交叉/综合/新兴"],["International Conference on Intelligent Computing","ICIC","C","conf","交叉/综合/新兴"],["International Conference on Service Science","ICSS","C","conf","交叉/综合/新兴"],["Advances in Financial Technologies","AFT","C","conf","交叉/综合/新兴"],["International Joint Conference on Theoretical Computer  Science - Frontier of Algorithmic Wisdom","IJTCS-FAW","C","conf","交叉/综合/新兴"],["Artificial Intelligence","AI","A","journal","人工智能"],["IEEE Transactions on Pattern Analysis and Machine Intelligence","TPAMI","A","journal","人工智能"],["International Journal of Computer Vision","IJCV","A","journal","人工智能"],["Journal of Machine Learning Research","JMLR","A","journal","人工智能"],["ACM Transactions on Applied Perception","TAP","B","journal","人工智能"],["Autonomous Agents and Multi-Agent Systems","AAMAS","B","journal","人工智能"],["Computational Linguistics","","B","journal","人工智能"],["Computer Vision and Image Understanding","CVIU","B","journal","人工智能"],["Data & Knowledge Engineering","DKE","B","journal","人工智能"],["Evolutionary Computation","","B","journal","人工智能"],["IEEE Transactions on Affective Computing","TAC","B","journal","人工智能"],["IEEE-ACM Transactions on Audio Speech and Language Processing","TASLP","B","journal","人工智能"],["IEEE Transactions on Cybernetics","","B","journal","人工智能"],["IEEE Transactions on Evolutionary Computation","TEC","B","journal","人工智能"],["IEEE Transactions on Fuzzy Systems","TFS","B","journal","人工智能"],["IEEE Transactions on Neural Networks and learning systems","TNNLS","B","journal","人工智能"],["International Journal of Approximate Reasoning","IJAR","B","journal","人工智能"],["Journal of Artificial Intelligence Research","JAIR","B","journal","人工智能"],["Journal of Automated Reasoning","","B","journal","人工智能"],["Journal of Speech Language and Hearing Research","JSLHR","B","journal","人工智能"],["Machine Learning","","B","journal","人工智能"],["Neural Computation","","B","journal","人工智能"],["Neural Networks","","B","journal","人工智能"],["Pattern Recognition","PR","B","journal","人工智能"],["Transactions of the Association for Computational Linguistics","TACL","B","journal","人工智能"],["ACM Transactions on Asian and Low-Resource Language Information Processing","TALLIP","C","journal","人工智能"],["Applied Intelligence","","C","journal","人工智能"],["Artificial Intelligence in Medicine","AIM","C","journal","人工智能"],["Artificial Life","","C","journal","人工智能"],["Computational Intelligence","","C","journal","人工智能"],["Computer Speech and Language","","C","journal","人工智能"],["Connection Science","","C","journal","人工智能"],["Decision Support Systems","DSS","C","journal","人工智能"],["Engineering Applications of Artificial Intelligence","EAAI","C","journal","人工智能"],["Expert Systems","","C","journal","人工智能"],["Expert Systems with Applications","ESWA","C","journal","人工智能"],["Fuzzy Sets and Systems","","C","journal","人工智能"],["IEEE Transactions on Games","TG","C","journal","人工智能"],["IET Computer Vision","IET-CVI","C","journal","人工智能"],["IET Signal Processing","","C","journal","人工智能"],["Image and Vision Computing","IVC","C","journal","人工智能"],["Intelligent Data Analysis","IDA","C","journal","人工智能"],["International Journal of Computational Intelligence and Applications","IJCIA","C","journal","人工智能"],["International Journal of Intelligent Systems","IJIS","C","journal","人工智能"],["International Journal of Neural Systems","IJNS","C","journal","人工智能"],["International Journal of Pattern Recognition and Artificial Intelligence","IJPRAI","C","journal","人工智能"],["International Journal of Uncertainty Fuzziness and Knowledge-Based Systems","IJUFKS","C","journal","人工智能"],["International Journal on Document Analysis and Recognition","IJDAR","C","journal","人工智能"],["Journal of Experimental & Theoretical Artificial Intelligence","JETAI","C","journal","人工智能"],["Knowledge-Based Systems","KBS","C","journal","人工智能"],["Machine Translation","","C","journal","人工智能"],["Machine Vision and Applications","","C","journal","人工智能"],["Natural Computing","","C","journal","人工智能"],["Natural Language Engineering","NLE","C","journal","人工智能"],["Neural Computing & Applications","NCA","C","journal","人工智能"],["Neural Processing Letters","NPL","C","journal","人工智能"],["Neurocomputing","","C","journal","人工智能"],["Pattern Analysis and Applications","PAA","C","journal","人工智能"],["Pattern Recognition Letters","PRL","C","journal","人工智能"],["Soft Computing","","C","journal","人工智能"],["Web Intelligence","WI","C","journal","人工智能"],["ACM Transactions on Interactive Intelligent Systems","TIIS","C","journal","人工智能"],["ACM Transactions on Evolutionary Learning and  Optimization","TELO","C","journal","人工智能"],["ACM Journal on Autonomous Transportation Systems","JATS","C","journal","人工智能"],["AAAI Conference on Artificial Intelligence","AAAI","A","conf","人工智能"],["Conference on Neural Information Processing Systems","NeurIPS","A","conf","人工智能"],["Annual Meeting of the Association for Computational Linguistics","ACL","A","conf","人工智能"],["IEEE/CVF Computer Vision and Pattern Recognition Conference","CVPR","A","conf","人工智能"],["International Conference on Computer Vision","ICCV","A","conf","人工智能"],["International Conference on Machine Learning","ICML","A","conf","人工智能"],["International Conference on Learning Representations","ICLR","A","conf","人工智能"],["Annual Conference on Computational Learning Theory","COLT","B","conf","人工智能"],["Conference on Empirical Methods in Natural Language Processing","EMNLP","B","conf","人工智能"],["European Conference on Artificial Intelligence","ECAI","B","conf","人工智能"],["European Conference on Computer Vision","ECCV","B","conf","人工智能"],["IEEE International Conference on Robotics and Automation","ICRA","B","conf","人工智能"],["International Conference on Automated Planning and Scheduling","ICAPS","B","conf","人工智能"],["International Conference on Case-Based Reasoning","ICCBR","B","conf","人工智能"],["International Conference on Computational Linguistics","COLING","B","conf","人工智能"],["International Conference on Principles of Knowledge Representation and Reasoning","KR","B","conf","人工智能"],["Conference on Uncertainty in Artificial Intelligence","UAI","B","conf","人工智能"],["International Joint Conference on Autonomous Agents and Multi-agent Systems","AAMAS","B","conf","人工智能"],["Parallel Problem Solving from Nature","PPSN","B","conf","人工智能"],["North  American Chapter of the Associationfor Computational Linguistics","NAACL","B","conf","人工智能"],["International Joint Conference on Artificial Intelligence","IJCAI","B","conf","人工智能"],["International Conference on Artificial Intelligence and Statistics","AISTATS","C","conf","人工智能"],["Asian Conference on Computer Vision","ACCV","C","conf","人工智能"],["Asian Conference on Machine Learning","ACML","C","conf","人工智能"],["British Machine Vision Conference","BMVC","C","conf","人工智能"],["CCF International Conference on Natural Language Processing and Chinese Computing","NLPCC","C","conf","人工智能"],["Conference on Computational Natural Language Learning","CoNLL","C","conf","人工智能"],["Genetic and Evolutionary Computation Conference","GECCO","C","conf","人工智能"],["IEEE International Conference on Tools with Artificial Intelligence","ICTAI","C","conf","人工智能"],["IEEE\\RSJ International Conference on Intelligent Robots and Systems","IROS","C","conf","人工智能"],["International Conference on Algorithmic Learning Theory","ALT","C","conf","人工智能"],["International Conference on Artificial Neural Networks","ICANN","C","conf","人工智能"],["IEEE International Conference on AutomaticFace and Gesture Recognition","FG","C","conf","人工智能"],["International Conference on Document Analysis and Recognition","ICDAR","C","conf","人工智能"],["International Conference on Inductive Logic Programming","ILP","C","conf","人工智能"],["International conference on Knowledge Science,Engineering and Management","KSEM","C","conf","人工智能"],["International Conference on Neural Information Processing","ICONIP","C","conf","人工智能"],["International Conference on Pattern Recognition","ICPR","C","conf","人工智能"],["International Joint Conference onBiometrics","IJCB","C","conf","人工智能"],["International Joint Conference on Neural Networks","IJCNN","C","conf","人工智能"],["Pacific Rim International Conference on Artificial Intelligence","PRICAI","C","conf","人工智能"],["Congress on Evolutionary Computation","IEEE CEC","C","conf","人工智能"],["International Conference on Distributed Artificial  Intelligence","DAI","C","conf","人工智能"],["ACM Transactions on Computer-Human Interaction","TOCHI","A","journal","人机交互与普适计算"],["International Journal of Human-Computer Studies","IJHCS","A","journal","人机交互与普适计算"],["Computer Supported Cooperative Work-The Journal of Collaborative Computing and Work Practices","CSCW","B","journal","人机交互与普适计算"],["Human-Computer Interaction","HCI","B","journal","人机交互与普适计算"],["IEEE Transactions on Human-Machine Systems","","B","journal","人机交互与普适计算"],["Interacting with Computers","IWC","B","journal","人机交互与普适计算"],["International Journal of Human-Computer Interaction","IJHCI","B","journal","人机交互与普适计算"],["User Modeling and User-Adapted Interaction","UMUAI","B","journal","人机交互与普适计算"],["IEEE Transactions on Systems Man Cybernetics-Systems","TSMC","B","journal","人机交互与普适计算"],["CCF Transactions on Pervasive Computing and Interaction","CCF TPCI","B","journal","人机交互与普适计算"],["Behaviour & Information Technology","BIT","C","journal","人机交互与普适计算"],["Personal and Ubiquitous Computing","PUC","C","journal","人机交互与普适计算"],["Pervasive and Mobile Computing","PMC","C","journal","人机交互与普适计算"],["Proceedings of the ACM on Human-Computer Interaction","PACMHCI","C","journal","人机交互与普适计算"],["ACM Transactions on Human-Robot Interaction","THRI","C","journal","人机交互与普适计算"],["ACM Conference on Computer Supported Cooperative Work and Social Computing","CSCW","A","conf","人机交互与普适计算"],["ACM Conference on Human Factors in Computing Systems","CHI","A","conf","人机交互与普适计算"],["ACM international Joint Conference on Pervasive and Ubiquitous Computing","UbiComp","A","conf","人机交互与普适计算"],["ACM Symposium on User Interface Software and Technology","UIST","A","conf","人机交互与普适计算"],["ACM International Conference on Supporting Group Work","GROUP","B","conf","人机交互与普适计算"],["ACM International Conference on Intelligent User Interfaces","IUI","B","conf","人机交互与普适计算"],["ACM International Conference on Interactive Tabletops and Surfaces","ITS","B","conf","人机交互与普适计算"],["European Conference on Computer Supported Cooperative Work","ECSCW","B","conf","人机交互与普适计算"],["IEEE International Conference on Pervasive Computing and Communications","PERCOM","B","conf","人机交互与普适计算"],["ACM International Conference on Mobile Human-Computer Interaction","MobileHCI","B","conf","人机交互与普适计算"],["The International AAAI Conference on Web and Social Media","ICWSM","B","conf","人机交互与普适计算"],["ACM SIGCHI Conference on Designing Interactive Systems","DIS","C","conf","人机交互与普适计算"],["ACM International Conference on Multimodal Interaction","ICMI","C","conf","人机交互与普适计算"],["International ACM SIGACCESS Conference on Computers and Accessibility","ASSETS","C","conf","人机交互与普适计算"],["Graphics Interface","GI","C","conf","人机交互与普适计算"],["IEEE International Conference on Ubiquitous Intelligence and Computing","UIC","C","conf","人机交互与普适计算"],["IEEE World Haptics Conference","","C","conf","人机交互与普适计算"],["International Conference on Human-Computer Interaction of International Federation for Information Processing","INTERACT","C","conf","人机交互与普适计算"],["ACM Interaction Design and Children","IDC","C","conf","人机交互与普适计算"],["International Conference on Collaborative Computing: Networking, Applications and Worksharing","CollaborateCom","C","conf","人机交互与普适计算"],["International Conference on Computer Supported Cooperative Work in Design","CSCWD","C","conf","人机交互与普适计算"],["International Conference on Cooperative Information Systems","CoopIS","C","conf","人机交互与普适计算"],["International Conference on Mobile and Ubiquitous Systems: Computing,Networking and Services","MobiQuitous","C","conf","人机交互与普适计算"],["International Working Conference on Advanced Visual Interfaces","AVI","C","conf","人机交互与普适计算"],["Conference on Green, Pervasive and Cloud Computing","GPC","C","conf","人机交互与普适计算"],["CCF International Conference on Extended Reality","ICXR","C","conf","人机交互与普适计算"],["ACM Transactions on Database Systems","TODS","A","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on Information Systems","TOIS","A","journal","数据库/数据挖掘/内容检索"],["IEEE Transactions on Knowledge and Data Engineering","TKDE","A","journal","数据库/数据挖掘/内容检索"],["VLDB Journal","VLDBJ","A","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on Knowledge Discovery from Data","TKDD","B","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on the Web","TWEB","B","journal","数据库/数据挖掘/内容检索"],["Advanced Engineering Informatics","AEI","B","journal","数据库/数据挖掘/内容检索"],["Data & Knowledge Engineering","DKE","B","journal","数据库/数据挖掘/内容检索"],["Data Mining and Knowledge Discovery","DMKD","B","journal","数据库/数据挖掘/内容检索"],["European Journal of Information Systems","EJIS","B","journal","数据库/数据挖掘/内容检索"],["GeoInformatica","","B","journal","数据库/数据挖掘/内容检索"],["Information Processing & Management","IPM","B","journal","数据库/数据挖掘/内容检索"],["Information Sciences","","B","journal","数据库/数据挖掘/内容检索"],["Information Systems","IS","B","journal","数据库/数据挖掘/内容检索"],["Journal of the Association for Information Science and Technology","JASIST","B","journal","数据库/数据挖掘/内容检索"],["Journal of Web Semantics","JWS","B","journal","数据库/数据挖掘/内容检索"],["Knowledge and Information Systems","KAIS","B","journal","数据库/数据挖掘/内容检索"],["Data Science and Engineering","DSE","B","journal","数据库/数据挖掘/内容检索"],["Distributed and Parallel Databases","DPD","C","journal","数据库/数据挖掘/内容检索"],["Information & Management","I&M","C","journal","数据库/数据挖掘/内容检索"],["Information Processing Letters","IPL","C","journal","数据库/数据挖掘/内容检索"],["Information Retrieval Journal","IR","C","journal","数据库/数据挖掘/内容检索"],["International Journal of Cooperative Information Systems","IJCIS","C","journal","数据库/数据挖掘/内容检索"],["International Journal of Geographical Information Science","IJGIS","C","journal","数据库/数据挖掘/内容检索"],["International Journal of Intelligent Systems","IJIS","C","journal","数据库/数据挖掘/内容检索"],["International Journal of Knowledge Management","IJKM","C","journal","数据库/数据挖掘/内容检索"],["International Journal on Semantic Web and Information Systems","IJSWIS","C","journal","数据库/数据挖掘/内容检索"],["Journal of Computer Information Systems","JCIS","C","journal","数据库/数据挖掘/内容检索"],["Journal of Database Management","JDM","C","journal","数据库/数据挖掘/内容检索"],["Journal of Global Information Technology Management","JGITM","C","journal","数据库/数据挖掘/内容检索"],["Journal of Intelligent Information Systems","JIIS","C","journal","数据库/数据挖掘/内容检索"],["Journal of Strategic Information Systems","JSIS","C","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on Intelligent Systems and Technology","TIST","C","journal","数据库/数据挖掘/内容检索"],["ACM Transactions on Recommender Systems","TORS","C","journal","数据库/数据挖掘/内容检索"],["ACM SIGMOD Conference","SIGMOD","A","conf","数据库/数据挖掘/内容检索"],["ACM SIGKDD Conference on Knowledge Discovery and Data Mining","SIGKDD","A","conf","数据库/数据挖掘/内容检索"],["IEEE International Conference on Data Engineering","ICDE","A","conf","数据库/数据挖掘/内容检索"],["International ACM SIGIR Conference on Research and Development in Information Retrieval","SIGIR","A","conf","数据库/数据挖掘/内容检索"],["International Conference on Very Large Data Bases","VLDB","A","conf","数据库/数据挖掘/内容检索"],["ACM International Conference on Information and Knowledge Management","CIKM","B","conf","数据库/数据挖掘/内容检索"],["ACM International Conference on Web Search and Data Mining","WSDM","B","conf","数据库/数据挖掘/内容检索"],["ACM SIGMOD-SIGACT-SIGAI Symposium on Principles of Database Systems","PODS","B","conf","数据库/数据挖掘/内容检索"],["International Conference on Database Systems for Advanced Applications","DASFAA","B","conf","数据库/数据挖掘/内容检索"],["European Conference on Machine Learning and Principles and Practice of Knowledge Discovery in Databases","ECML-PKDD","B","conf","数据库/数据挖掘/内容检索"],["IEEE International Semantic Web Conference","ISWC","B","conf","数据库/数据挖掘/内容检索"],["IEEE International Conference on Data Mining","ICDM","B","conf","数据库/数据挖掘/内容检索"],["International Conference on Database Theory","ICDT","B","conf","数据库/数据挖掘/内容检索"],["International Conference on Extending DatabaseTechnology","EDBT","B","conf","数据库/数据挖掘/内容检索"],["Conference on Innovative DataSystems Research","CIDR","B","conf","数据库/数据挖掘/内容检索"],["SIAM International Conference on Data Mining","SDM","B","conf","数据库/数据挖掘/内容检索"],["ACM Conference on Recommender Systems","RecSys","B","conf","数据库/数据挖掘/内容检索"],["Web Information Systems Engineering Conference","WISE","B","conf","数据库/数据挖掘/内容检索"],["Asia Pacific Web Conference","APWeb","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Database and Expert System Applications","DEXA","C","conf","数据库/数据挖掘/内容检索"],["European Conference on Information Retrieval","ECIR","C","conf","数据库/数据挖掘/内容检索"],["Extended Semantic Web Conference","ESWC","C","conf","数据库/数据挖掘/内容检索"],["International Workshop on Web andDatabases","WebDB","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Conceptual Modeling","ER","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Mobile Data Management","MDM","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Scientific andStatistical Database Management","SSDBM","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Web Age Information Management","WAIM","C","conf","数据库/数据挖掘/内容检索"],["International Symposium on Spatial and Temporal Databases","SSTD","C","conf","数据库/数据挖掘/内容检索"],["Pacific-Asia Conference on Knowledge Discovery and Data Mining","PAKDD","C","conf","数据库/数据挖掘/内容检索"],["International Conference on Advanced Data Mining and  Applications","ADMA","C","conf","数据库/数据挖掘/内容检索"],["Web Information Systems and Applications","WISA","C","conf","数据库/数据挖掘/内容检索"],["IEEE Transactions on Dependable and Secure Computing","TDSC","A","journal","网络与信息安全"],["IEEE Transactions on Information Forensics and Security","TIFS","A","journal","网络与信息安全"],["Journal of Cryptology","","A","journal","网络与信息安全"],["ACM Transactions on Privacy and Security","TOPS","B","journal","网络与信息安全"],["Computers & Security","","B","journal","网络与信息安全"],["Designs Codes and Cryptography","","B","journal","网络与信息安全"],["Journal of Computer Security","JCS","B","journal","网络与信息安全"],["Cybersecurity","Cybersecurity","B","journal","网络与信息安全"],["Computer Law & Security Review","CLSR","C","journal","网络与信息安全"],["EURASIP Journal on Information Security","","C","journal","网络与信息安全"],["IET Information Security","","C","journal","网络与信息安全"],["Information and Computer Security","IMCS","C","journal","网络与信息安全"],["International Journal of Information and Computer Security","IJICS","C","journal","网络与信息安全"],["International Journal of Information Security and Privacy","IJISP","C","journal","网络与信息安全"],["Journal of Information Security and Applications","JISA","C","journal","网络与信息安全"],["Security and Communication Networks","SCN","C","journal","网络与信息安全"],["High-Confidence Computing","HCC","C","journal","网络与信息安全"],["ACM Conference on Computer and Communications Security","CCS","A","conf","网络与信息安全"],["International Conference on the Theory and Applications of Cryptographic Techniques","EUROCRYPT","A","conf","网络与信息安全"],["IEEE Symposium on Security and Privacy","S&P","A","conf","网络与信息安全"],["International Cryptology Conference","CRYPTO","A","conf","网络与信息安全"],["USENIX Security Symposium","USENIX Security","A","conf","网络与信息安全"],["Network and Distributed System Security Symposium","NDSS","A","conf","网络与信息安全"],["Annual Computer Security Applications Conference","ACSAC","B","conf","网络与信息安全"],["Annual International Conference on the Theory and Application of Cryptology and Information Security","ASIACRYPT","B","conf","网络与信息安全"],["European Symposium on Research in Computer Security","ESORICS","B","conf","网络与信息安全"],["Fast Software Encryption","FSE","B","conf","网络与信息安全"],["IEEE Computer Security Foundations Workshop","CSFW","B","conf","网络与信息安全"],["IEEE International Symposium on Reliable Distributed Systems","SRDS","B","conf","网络与信息安全"],["International Conference on Cryptographic Hardware and Embedded Systems","CHES","B","conf","网络与信息安全"],["International Conference on Dependable Systems and Networks","DSN","B","conf","网络与信息安全"],["International Symposium on Recent Advances in Intrusion Detection","RAID","B","conf","网络与信息安全"],["International Workshop on Practice and Theory in Public Key Cryptography","PKC","B","conf","网络与信息安全"],["Theory of Cryptography Conference","TCC","B","conf","网络与信息安全"],["ACM Conference on Security and Privacy in Wireless and Mobile Networks","WiSec","C","conf","网络与信息安全"],["ACM Symposium on Access Control Models and Technologies","SACMAT","C","conf","网络与信息安全"],["ACM Workshop on Digital Rights Management","DRM","C","conf","网络与信息安全"],["ACM Workshop on Information Hiding and Multimedia Security","IH&MMSec","C","conf","网络与信息安全"],["International Conference on Applied Cryptography and Network Security","ACNS","C","conf","网络与信息安全"],["ACM Asia Conference on Computer and Communications Security","AsiaCCS","C","conf","网络与信息安全"],["AustralasiaConferenceonInformation SecurityandPrivacy","ACISP","C","conf","网络与信息安全"],["The Cryptographer's Track at RSA Conference","CT-RSA","C","conf","网络与信息安全"],["Conference on Detection of Intrusions and Malware & VulnerabilityAssessment","DIMVA","C","conf","网络与信息安全"],["Digital Forensic Research Workshop","DFRWS","C","conf","网络与信息安全"],["Financial Cryptography and Data Security","FC","C","conf","网络与信息安全"],["IEEE International Conference on Trust,Security and Privacy in Computing and Communications","TrustCom","C","conf","网络与信息安全"],["IFIP International Information Security Conference","SEC","C","conf","网络与信息安全"],["IFIP Working Group 11.9 International Conference on Digital Forensics","IFIP WG 11.9","C","conf","网络与信息安全"],["Information Security Conference","ISC","C","conf","网络与信息安全"],["International Conference on Digital Forensics & Cyber Crime","ICDF2C","C","conf","网络与信息安全"],["International Conference on Information and Communications Security","ICICS","C","conf","网络与信息安全"],["International Conference on Security and Privacy in Communication Networks","SecureComm","C","conf","网络与信息安全"],["New Security Paradigms Workshop","NSPW","C","conf","网络与信息安全"],["Passive and Active Measurement Conference","PAM","C","conf","网络与信息安全"],["Privacy Enhancing Technologies Symposium","PETS","C","conf","网络与信息安全"],["Selected Areas in Cryptography","SAC","C","conf","网络与信息安全"],["Symposium On Usable Privacy and Security","SOUPS","C","conf","网络与信息安全"],["IEEE European Symposium on Security and Privacy","EuroS&P","C","conf","网络与信息安全"],["International Conference on Information Security and Cryptology","Inscrypt","C","conf","网络与信息安全"],["Conference on Data and Application Security and Privacy","CODASPY","C","conf","网络与信息安全"],["International Conference on Blockchain, Artificial  Intelligence, and Trustworthy Systems","BlockSys","C","conf","网络与信息安全"],["International Conference on Cyber Security and Cloud  Computing","CSCloud","C","conf","网络与信息安全"],["ACM Transactions on Computer Systems","TOCS","A","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Storage","TOS","A","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Computer-Aided Design of Integrated Circuits and Systems","TCAD","A","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Computers","TC","A","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Parallel and Distributed Systems","TPDS","A","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Architecture and Code Optimization","TACO","A","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Autonomous and Adaptive Systems","TAAS","B","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Design Automation of Electronic Systems","TODAES","B","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Embedded Computing Systems","TECS","B","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Reconfigurable Technology and Systems","TRETS","B","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Very Large Scale Integration (VLSI) Systems","TVLSI","B","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Parallel and Distributed Computing","JPDC","B","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Systems Architecture","JSA","B","journal","计算机体系结构/并行与分布计算/存储系统"],["Parallel Computing","","B","journal","计算机体系结构/并行与分布计算/存储系统"],["Performance Evaluation","","B","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Cloud Computing","TCC","B","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM Journal on Emerging Technologies in Computing Systems","JETC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Concurrency and Computation-Practice & Experience","","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Distributed Computing","DC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Future Generation Computer Systems-The International Journal of eScience","FGCS","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Integration-the VLSI Journal","Integration","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Electronic Testing-Theory and Applications","JETTA","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Grid computing","JGC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Real-Time Systems","RTS","C","journal","计算机体系结构/并行与分布计算/存储系统"],["Journal of Supercomputing","TJSC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Circuits and Systems I-Regular Papers","TCASI","C","journal","计算机体系结构/并行与分布计算/存储系统"],["CCF Transactions on High Performance Computing","CCF-THPC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["IEEE Transactions on Sustainable Computing","TSUSC","C","journal","计算机体系结构/并行与分布计算/存储系统"],["ACM SIGPLAN Symposium on Principles & Practice of Parallel Programming","PPoPP","A","conf","计算机体系结构/并行与分布计算/存储系统"],["USENIX Conference on File and Storage Technologies","FAST","A","conf","计算机体系结构/并行与分布计算/存储系统"],["Design Automation Conference","DAC","A","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Symposium on High Performance Computer Architecture","HPCA","A","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE/ACM International Symposium on Microarchitecture","MICRO","A","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference for High Performance Computing, Networking, Storage, and Analysis","SC","A","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Architectural Support for Programming Languages and Operating Systems","ASPLOS","A","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Computer Architecture","ISCA","A","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM SIGOPS Annual Technical Conference","ACM SIGOPS ATC","A","conf","计算机体系结构/并行与分布计算/存储系统"],["European Conference on Computer Systems","EuroSys","A","conf","计算机体系结构/并行与分布计算/存储系统"],["The International ACM Symposium on High-Performance  Parallel and Distributed Computing","HPDC","A","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM Symposium on Cloud Computing","SOCC","B","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM Symposium on Parallelism in Algorithms and Architectures","SPAA","B","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM Symposium on Principles of Distributed Computing","PODC","B","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM/SIGDA International Symposium on Field-Programmable Gate Arrays","FPGA","B","conf","计算机体系结构/并行与分布计算/存储系统"],["The International Symposium on Code Generation and Optimization","CGO","B","conf","计算机体系结构/并行与分布计算/存储系统"],["Design, Automation & Test in Europe","DATE","B","conf","计算机体系结构/并行与分布计算/存储系统"],["Hot Chips: A Symposium on High Performance Chips","HOT CHIPS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on Cluster Computing","CLUSTER","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Computer Design","ICCD","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Computer-Aided Design","ICCAD","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on Distributed Computing Systems","ICDCS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Hardware/Software Co-design and System Synthesis","CODES+ISSS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on High Performance and Embedded Architectures and Compilers","HiPEAC","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Measurement and Modeling of Computer Systems","SIGMETRICS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Parallel Architectures and Compilation Techniques","PACT","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Parallel Processing","ICPP","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Supercomputing","ICS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Virtual Execution Environments","VEE","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Parallel & Distributed Processing Symposium","IPDPS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Computer Performance, Modeling, Measurements and Evaluation","Performance","B","conf","计算机体系结构/并行与分布计算/存储系统"],["International Test Conference","ITC","B","conf","计算机体系结构/并行与分布计算/存储系统"],["Large Installation system Administration Conference","LISA","B","conf","计算机体系结构/并行与分布计算/存储系统"],["Mass Storage Systems and Technologies","MSST","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE Real-Time and Embedded Technology and ApplicationsSymposium","RTAS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["European Conference on Parallel and Distributed Computing","Euro-Par","B","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Symposium on Circuits and Systems","ISCAS","B","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM International Conference on Computing Frontiers","CF","C","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM International Systems and Storage Conference","SYSTOR","C","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM/IEEE International Symposium on Networks-on-Chip","NOCS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on Application-Specific Systems, Architectures, and Processors","ASAP","C","conf","计算机体系结构/并行与分布计算/存储系统"],["Asia and South Pacific Design Automation Conference","ASP-DAC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE European Test Symposium","ETS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Field-Programmable Logic and Applications","FPL","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE Symposium on Field-Programmable Custom Computing Machines","FCCM","C","conf","计算机体系结构/并行与分布计算/存储系统"],["Great Lakes Symposium on VLSI","GLSVLSI","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE Asian Test Symposium","ATS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on High Performance Computing and Communications","HPCC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Conference on High Performance Computing, Data and Analytics","HiPC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Modeling, Analysis, andSimulation of Computer and Telecommunication Systems","MASCOTS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE International Symposium on Parallel and Distributed Processing with Applications","ISPA","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE/ACM International Symposium on Cluster, Cloud and Grid Computing","CCGRID","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IFIP International Conference on Network and Parallel Computing","NPC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Algorithms and Architectures for Parallel Processing","ICA3PP","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Compilers, Architectures, and Synthesis for Embedded Systems","CASES","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Field-Programmable Technology","FPT","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Parallel and Distributed Systems","ICPADS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Low Power Electronics and Design","ISLPED","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Physical Design","ISPD","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE Symposium on High-Performance Interconnects","HOTI","C","conf","计算机体系结构/并行与分布计算/存储系统"],["IEEE VLSI Test Symposium","VTS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Test Conference in Asia","ITC-Asia","C","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM/IEEE Symposium on Edge Computing","SEC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on Networking, Architecture and  Storages","NAS","C","conf","计算机体系结构/并行与分布计算/存储系统"],["HotStorage","HotStorage","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Symposium on Advanced Parallel Processing  Technology","APPT","C","conf","计算机体系结构/并行与分布计算/存储系统"],["International Conference on JointCloud Computing","JCC","C","conf","计算机体系结构/并行与分布计算/存储系统"],["ACM Transactions on Graphics","TOG","A","journal","计算机图形学与多媒体"],["IEEE Transactions on Image Processing","TIP","A","journal","计算机图形学与多媒体"],["IEEE Transactions on Visualization and Computer Graphics","TVCG","A","journal","计算机图形学与多媒体"],["IEEE Transactions on Multimedia","TMM","A","journal","计算机图形学与多媒体"],["ACM Transactions on Multimedia Computing Communications and Applications","TOMM","B","journal","计算机图形学与多媒体"],["Computer Aided Geometric Design","CAGD","B","journal","计算机图形学与多媒体"],["Computer Graphics Forum","CGF","B","journal","计算机图形学与多媒体"],["Computer-Aided Design","CAD","B","journal","计算机图形学与多媒体"],["IEEE Transactions on Circuits and Systems for Video Technology","TCSVT","B","journal","计算机图形学与多媒体"],["Journal of the Acoustical Society of America","JASA","B","journal","计算机图形学与多媒体"],["SIAM Journal on Imaging Sciences","SIIMS","B","journal","计算机图形学与多媒体"],["Speech Communication","SPECOM","B","journal","计算机图形学与多媒体"],["Computational Visual Media","CVMJ","B","journal","计算机图形学与多媒体"],["Computational Geometry-Theory and Applications","CGTA","C","journal","计算机图形学与多媒体"],["Computer Animation and Virtual Worlds","CAVW","C","journal","计算机图形学与多媒体"],["Computers & Graphics-UK","C&G","C","journal","计算机图形学与多媒体"],["Discrete & Computational Geometry","DCG","C","journal","计算机图形学与多媒体"],["IEEE Signal Processing Letters","SPL","C","journal","计算机图形学与多媒体"],["IET Image Processing","IET-IPR","C","journal","计算机图形学与多媒体"],["Journal of Visual Communication and Image Representation","JVCIR","C","journal","计算机图形学与多媒体"],["Multimedia Systems","MS","C","journal","计算机图形学与多媒体"],["Multimedia Tools and Applications","MTA","C","journal","计算机图形学与多媒体"],["Signal Processing","SIGPRO","C","journal","计算机图形学与多媒体"],["Signal Processing-Image Communication","IMAGE","C","journal","计算机图形学与多媒体"],["Visual Computer","TVC","C","journal","计算机图形学与多媒体"],["Visual Informatics","VI","C","journal","计算机图形学与多媒体"],["Virtual Reality & Intelligent Hardware","VRIH","C","journal","计算机图形学与多媒体"],["Graphical Models","GMOD","C","journal","计算机图形学与多媒体"],["ACM International Conference on Multimedia","ACM MM","A","conf","计算机图形学与多媒体"],["ACM Special Interest Group on Computer Graphics","SIGGRAPH","A","conf","计算机图形学与多媒体"],["IEEE Virtual Reality","VR","A","conf","计算机图形学与多媒体"],["IEEE Visualization Conference","IEEE VIS","A","conf","计算机图形学与多媒体"],["ACM SIGMM International Conference on Multimedia Retrieval","ICMR","B","conf","计算机图形学与多媒体"],["ACM SIGGRAPH Symposium onInteractive 3D Graphics and Games","I3D","B","conf","计算机图形学与多媒体"],["ACM SIGGRAPH/Eurographics Symposium on Computer Animation","SCA","B","conf","计算机图形学与多媒体"],["Data Compression Conference","DCC","B","conf","计算机图形学与多媒体"],["Annual Conference of the European Association for Computer Graphics","Eurographics","B","conf","计算机图形学与多媒体"],["Eurographics Conference on Visualization","EuroVis","B","conf","计算机图形学与多媒体"],["Eurographics Symposium on Geometry Processing","SGP","B","conf","计算机图形学与多媒体"],["Eurographics Symposium on Rendering","EGSR","B","conf","计算机图形学与多媒体"],["IEEE International Conference on Acoustics,Speech and Signal Processing","ICASSP","B","conf","计算机图形学与多媒体"],["IEEE International Conference on Multimedia& Expo","ICME","B","conf","计算机图形学与多媒体"],["International Symposium on Mixed and Augmented Reality","ISMAR","B","conf","计算机图形学与多媒体"],["Pacific Conference on Computer Graphics and Applications","PG","B","conf","计算机图形学与多媒体"],["Symposium on Solid and Physical Modeling","SPM","B","conf","计算机图形学与多媒体"],["Conference of the International Speech Communication Association","INTERSPEECH","B","conf","计算机图形学与多媒体"],["ACM Symposium on Virtual Reality Software and Technology","VRST","C","conf","计算机图形学与多媒体"],["International Conference on Computer Animation and Social Agents","CASA","C","conf","计算机图形学与多媒体"],["Computer Graphics International","CGI","C","conf","计算机图形学与多媒体"],["Geometric Modeling and Processing","GMP","C","conf","计算机图形学与多媒体"],["IEEE Pacific Visualization Symposium","PacificVis","C","conf","计算机图形学与多媒体"],["International Conference on 3D Vision","3DV","C","conf","计算机图形学与多媒体"],["International Conference on Computer-Aided Design and Computer Graphics","CAD/Graphics","C","conf","计算机图形学与多媒体"],["IEEE International Conference on Image Processing","ICIP","C","conf","计算机图形学与多媒体"],["International Conference on Multimedia Modeling","MMM","C","conf","计算机图形学与多媒体"],["ACM Multimedia Asia","MMAsia","C","conf","计算机图形学与多媒体"],["Shape Modeling International","SMI","C","conf","计算机图形学与多媒体"],["Computational Visual Media","CVM","C","conf","计算机图形学与多媒体"],["Chinese Conference on Pattern Recognition and Computer Vision","PRCV","C","conf","计算机图形学与多媒体"],["International Conference on Image and Graphics","ICIG","C","conf","计算机图形学与多媒体"],["National Conference on Man-Machine  Speech Communication","NCMMSC","C","conf","计算机图形学与多媒体"],["Automatic Speech Recognition and Understanding Workshop","ASRU","C","conf","计算机图形学与多媒体"],["Spoken Language Technology","SLT","C","conf","计算机图形学与多媒体"],["IEEE Transactions on Information Theory","TIT","A","journal","计算机科学理论"],["Information and Computation","IANDC","A","journal","计算机科学理论"],["SIAM Journal on Computing","SICOMP","A","journal","计算机科学理论"],["ACM Transactions on Algorithms","TALG","B","journal","计算机科学理论"],["ACM Transactions on Computational Logic","TOCL","B","journal","计算机科学理论"],["ACM Transactions on Mathematical Software","TOMS","B","journal","计算机科学理论"],["Algorithmica","Algorithmica","B","journal","计算机科学理论"],["Computational complexity","CC","B","journal","计算机科学理论"],["Formal Aspects of Computing","FAC","B","journal","计算机科学理论"],["Formal Methods in System Design","FMSD","B","journal","计算机科学理论"],["INFORMS Journal on Computing","INFORMS","B","journal","计算机科学理论"],["Journal of Computer and System Sciences","JCSS","B","journal","计算机科学理论"],["Journal of Global Optimization","JGO","B","journal","计算机科学理论"],["Journal of Symbolic Computation","JSC","B","journal","计算机科学理论"],["Mathematical Structures in Computer Science","MSCS","B","journal","计算机科学理论"],["Theoretical Computer Science","TCS","B","journal","计算机科学理论"],["Acta Informatica","ACTA","C","journal","计算机科学理论"],["Annals of Pure and Applied Logic","APAL","C","journal","计算机科学理论"],["Discrete Applied Mathematics","DAM","C","journal","计算机科学理论"],["Fundamenta Informaticae","FUIN","C","journal","计算机科学理论"],["Information Processing Letters","IPL","C","journal","计算机科学理论"],["Journal of Complexity","JCOMPLEXITY","C","journal","计算机科学理论"],["Journal of Logic and Computation","LOGCOM","C","journal","计算机科学理论"],["Journal of Symbolic Logic","JSL","C","journal","计算机科学理论"],["Logical Methods in Computer Science","LMCS","C","journal","计算机科学理论"],["SIAM Journal on Discrete Mathematics","SIDMA","C","journal","计算机科学理论"],["Theory of Computing Systems","","C","journal","计算机科学理论"],["ACM Transactions in Quantum Computing","TQC","C","journal","计算机科学理论"],["ACM Symposium on Theory of Computing","STOC","A","conf","计算机科学理论"],["ACM-SIAM Symposium on Discrete Algorithms","SODA","A","conf","计算机科学理论"],["International Conference on Computer Aided Verification","CAV","A","conf","计算机科学理论"],["IEEE Annual Symposium on Foundations of Computer Science","FOCS","A","conf","计算机科学理论"],["ACM/IEEE Symposium on Logic in Computer Science","LICS","A","conf","计算机科学理论"],["International Symposium on Computational Geometry","SoCG","B","conf","计算机科学理论"],["European Symposium on Algorithms","ESA","B","conf","计算机科学理论"],["Conference on Computational Complexity","CCC","B","conf","计算机科学理论"],["International Colloquium on Automata, Languages and Programming","ICALP","B","conf","计算机科学理论"],["International Conference on Automated Deduction/International Joint Conference on Automated Reasoning","","B","conf","计算机科学理论"],["International Conference on Concurrency Theory","CONCUR","B","conf","计算机科学理论"],["International Conference on Hybrid Systems: Computation and Control","HSCC","B","conf","计算机科学理论"],["International Conference on Theory and Applications of Satisfiability Testing","SAT","B","conf","计算机科学理论"],["International Computing and Combinatorics Conference","COCOON","B","conf","计算机科学理论"],["Formal Method in Computer-Aided Design","FMCAD","B","conf","计算机科学理论"],["Computer Science Logic","CSL","C","conf","计算机科学理论"],["Foundations of Software Technology and Theoretical Computer Science","FSTTCS","C","conf","计算机科学理论"],["IEEE International Conference on Data Science and Advanced Analytics","DSAA","C","conf","计算机科学理论"],["International Colloquium on Theoretical Aspects of Computing","ICTAC","C","conf","计算机科学理论"],["International Conference on Integer Programming and Combinatorial Optimization","IPCO","C","conf","计算机科学理论"],["International Conference on Formal Structures for Computation and Deduction","FSCD","C","conf","计算机科学理论"],["International Symposium on Algorithms and Computation","ISAAC","C","conf","计算机科学理论"],["International Conference on Mathematical Foundations of Computer Science","MFCS","C","conf","计算机科学理论"],["Symposium on Theoretical Aspects of Computer Science","STACS","C","conf","计算机科学理论"],["International Symposium on Dependable Software Engineering: Theories, Tools, and Applications","SETTA","C","conf","计算机科学理论"],["IEEE Journal on Selected Areas in Communications","JSAC","A","journal","计算机网络"],["IEEE Transactions on Mobile Computing","TMC","A","journal","计算机网络"],["IEEE-ACM Transactions on Networking","TON","A","journal","计算机网络"],["ACM Transactions on Internet Technology","TOIT","B","journal","计算机网络"],["ACM Transactions on Multimedia Computing Communications and Applications","TOMM","B","journal","计算机网络"],["ACM Transactions on Sensor Networks","TOSN","B","journal","计算机网络"],["Computer Networks","CN","B","journal","计算机网络"],["IEEE Transactions on Communications","TCOM","B","journal","计算机网络"],["IEEE Transactions on Wireless Communications","TWC","B","journal","计算机网络"],["Ad hoc Networks","","C","journal","计算机网络"],["Computer Communications","CC","C","journal","计算机网络"],["IEEE Transactions on Network and Service Management","TNSM","C","journal","计算机网络"],["IET Communications","","C","journal","计算机网络"],["Journal of Network and Computer Applications","JNCA","C","journal","计算机网络"],["Mobile Networks & Applications","MONET","C","journal","计算机网络"],["Networks","","C","journal","计算机网络"],["Peer-to-Peer Networking and Applications","PPNA","C","journal","计算机网络"],["Wireless Communications & Mobile Computing","WCMC","C","journal","计算机网络"],["Wireless Networks","","C","journal","计算机网络"],["IEEE Internet of Things Journal","IOT","C","journal","计算机网络"],["ACM Transactions on Internet of Things","TIOT","C","journal","计算机网络"],["ACM International Conference on Applications, Technologies, Architectures, and Protocols for Computer Communication","SIGCOMM","A","conf","计算机网络"],["ACM International Conference on Mobile Computing and Networking","MobiCom","A","conf","计算机网络"],["IEEE International Conference on Computer Communications","INFOCOM","A","conf","计算机网络"],["Symposium on Network System Design and Implementation","NSDI","A","conf","计算机网络"],["ACM Conference on Embedded Networked Sensor Systems","SenSys","B","conf","计算机网络"],["ACM International Conference on emerging Networking EXperiments and Technologies","CoNEXT","B","conf","计算机网络"],["IEEE International Conference on Sensing, Communication, and Networking","SECON","B","conf","计算机网络"],["International Conference on Information Processing in Sensor Networks","IPSN","B","conf","计算机网络"],["ACM International Conference on Mobile Systems, Applications, and Services","MobiSys","B","conf","计算机网络"],["IEEE International Conference on Network Protocols","ICNP","B","conf","计算机网络"],["International Symposium on Theory, Algorithmic Foundations, and Protocol Design for Mobile Networks and Mobile Computing","MobiHoc","B","conf","计算机网络"],["International Workshop on Network and Operating System Support for Digital Audio and Video","NOSSDAV","B","conf","计算机网络"],["IEEE/ACM International Workshop on Quality of Service","IWQoS","B","conf","计算机网络"],["ACM Internet Measurement Conference","IMC","B","conf","计算机网络"],["刊物全称","刊物名称","C","conf","计算机网络"],["ACM/IEEE Symposium on Architectures for Networking and Communication Systems","ANCS","C","conf","计算机网络"],["Asia-Pacific Network Operations and Management Symposium","APNOMS","C","conf","计算机网络"],["International Conference on Formal Techniques for Distributed Objects, Components, and Systems","FORTE","C","conf","计算机网络"],["IEEE Conference on Local Computer Networks","LCN","C","conf","计算机网络"],["IEEE Global Communications Conference","GLOBECOM","C","conf","计算机网络"],["IEEE International Conference on Communications","ICC","C","conf","计算机网络"],["IEEE International Conference on Computer Communications and Networks","ICCCN","C","conf","计算机网络"],["IEEE International Conference on Mobile Ad-hoc and Sensor Systems","MASS","C","conf","计算机网络"],["IEEE International Conference on P2P Computing","P2P","C","conf","计算机网络"],["IEEE International Performance Computing and Communications Conference","IPCCC","C","conf","计算机网络"],["IEEE International Symposium on a World of Wireless Mobile and Multimedia Networks","WoWMoM","C","conf","计算机网络"],["IEEE Symposium on Computers and Communications","ISCC","C","conf","计算机网络"],["IEEE Wireless Communications and Networking Conference","WCNC","C","conf","计算机网络"],["IFIP International Conferences on Networking","Networking","C","conf","计算机网络"],["IFIP/IEEE International Symposium on Integrated NetworkManagement","IM","C","conf","计算机网络"],["International Conference on Mobility, Sensing and Networking","MSN","C","conf","计算机网络"],["International Conference on Modeling, Analysis and Simulation of Wireless and Mobile Systems","MSWiM","C","conf","计算机网络"],["International Conference on Wireless Algorithms, Systems, and Applications","WASA","C","conf","计算机网络"],["ACM The Workshop on Hot Topics in Networks","HotNets","C","conf","计算机网络"],["ACM Transactions on Programming Languages and Systems","TOPLAS","A","journal","软件工程/系统软件/程序设计语言"],["ACM Transactions on Software Engineering and Methodology","TOSEM","A","journal","软件工程/系统软件/程序设计语言"],["IEEE Transactions on Software Engineering","TSE","A","journal","软件工程/系统软件/程序设计语言"],["IEEE Transactions on Services Computing","TSC","A","journal","软件工程/系统软件/程序设计语言"],["Automated Software Engineering","ASE","B","journal","软件工程/系统软件/程序设计语言"],["Empirical Software Engineering","ESE","B","journal","软件工程/系统软件/程序设计语言"],["IET Software","IETS","B","journal","软件工程/系统软件/程序设计语言"],["Information and Software Technology","IST","B","journal","软件工程/系统软件/程序设计语言"],["Journal of Functional Programming","JFP","B","journal","软件工程/系统软件/程序设计语言"],["Journal of Software-Evolution and Process","","B","journal","软件工程/系统软件/程序设计语言"],["Journal of Systems and Software","JSS","B","journal","软件工程/系统软件/程序设计语言"],["Requirements Engineering","RE","B","journal","软件工程/系统软件/程序设计语言"],["Science of Computer Programming","SCP","B","journal","软件工程/系统软件/程序设计语言"],["Software and Systems Modeling","SoSyM","B","journal","软件工程/系统软件/程序设计语言"],["Software Testing Verification & Reliability","STVR","B","journal","软件工程/系统软件/程序设计语言"],["Software-Practice & Experience","SPE","B","journal","软件工程/系统软件/程序设计语言"],["Computer Languages, Systems and Structures","CL","C","journal","软件工程/系统软件/程序设计语言"],["International Journal of Software Engineering and Knowledge Engineering","IJSEKE","C","journal","软件工程/系统软件/程序设计语言"],["International Journal on Software Tools for Technology Transfer","STTT","C","journal","软件工程/系统软件/程序设计语言"],["Journal of Logical and Algebraic Methods in Programming","JLAMP","C","journal","软件工程/系统软件/程序设计语言"],["Journal of Web Engineering","JWE","C","journal","软件工程/系统软件/程序设计语言"],["Service Oriented Computing and Applications","SOCA","C","journal","软件工程/系统软件/程序设计语言"],["Software Quality Journal","SQJ","C","journal","软件工程/系统软件/程序设计语言"],["Theory and Practice of Logic Programming","TPLP","C","journal","软件工程/系统软件/程序设计语言"],["Proceedings of the ACM on Programming Languages-PACMPL","PACMPL","C","journal","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN Conference on Programming Language Design and Implementation","PLDI","A","conf","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages","POPL","A","conf","软件工程/系统软件/程序设计语言"],["ACM Joint European Software Engineering Conference and Symposium on the Foundations of Software Engineering","FSE/ESEC","A","conf","软件工程/系统软件/程序设计语言"],["ACM Symposium on Operating Systems Principles","SOSP","A","conf","软件工程/系统软件/程序设计语言"],["Conference on Object-Oriented Programming Systems, Languages,and Applications","OOPSLA","A","conf","软件工程/系统软件/程序设计语言"],["International Conference on Automated Software Engineering","ASE","A","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Engineering","ICSE","A","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Software Testing and Analysis","ISSTA","A","conf","软件工程/系统软件/程序设计语言"],["USENIX Symposium on Operating Systems Design and Implementations","OSDI","A","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Formal Methods","FM","A","conf","软件工程/系统软件/程序设计语言"],["European Conference on Object-Oriented Programming","ECOOP","B","conf","软件工程/系统软件/程序设计语言"],["European Joint Conferences on Theory and Practice of Software","ETAPS","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Program Comprehension","ICPC","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Requirements Engineering Conference","RE","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Advanced Information Systems Engineering","CAiSE","B","conf","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN International Conference on Function Programming","ICFP","B","conf","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN/SIGBED International Conference on Languages, Compilers andTools for Embedded Systems","LCTES","B","conf","软件工程/系统软件/程序设计语言"],["ACM/IEEE International Conference on Model Driven Engineering Languages and Systems","MoDELS","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Principles and Practice of Constraint Programming","CP","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Service Oriented Computing","ICSOC","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Software Analysis, Evolution,and Reengineering","SANER","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Maintenance and Evolution","ICSME","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Verification,Model Checking, and Abstract Interpretation","VMCAI","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Web Services","ICWS","B","conf","软件工程/系统软件/程序设计语言"],["International Middleware Conference","Middleware","B","conf","软件工程/系统软件/程序设计语言"],["International Static Analysis Symposium","SAS","B","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Empirical Software Engineering and Measurement","ESEM","B","conf","软件工程/系统软件/程序设计语言"],["IEEE International Symposium on Software Reliability Engineering","ISSRE","B","conf","软件工程/系统软件/程序设计语言"],["USENIX Workshop on Hot Topics in Operating Systems","HotOS","B","conf","软件工程/系统软件/程序设计语言"],["International Conference on Compiler Construction","CC","B","conf","软件工程/系统软件/程序设计语言"],["ACM SIGPLAN Workshop on Partial Evaluation and Program Manipulation","PEPM","C","conf","软件工程/系统软件/程序设计语言"],["ACMSIGPLAN-SIGSOFT Workshop on Program Analysis for Software Tools and Engineering","PASTE","C","conf","软件工程/系统软件/程序设计语言"],["Asian Symposium on Programming Languages and Systems","APLAS","C","conf","软件工程/系统软件/程序设计语言"],["Asia-Pacific Software Engineering Conference","APSEC","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Evaluation and Assessment in Software Engineering","EASE","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Engineering of Complex Computer Systems","ICECCS","C","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Software Testing, Verification and Validation","ICST","C","conf","软件工程/系统软件/程序设计语言"],["IEEE International Symposium on Performance Analysis of Systems and Software","ISPASS","C","conf","软件工程/系统软件/程序设计语言"],["IEEE International Working Conference on Source Code Analysis and Manipulation","SCAM","C","conf","软件工程/系统软件/程序设计语言"],["International Computer Software and Applications Conference","COMPSAC","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Formal Engineering Methods","ICFEM","C","conf","软件工程/系统软件/程序设计语言"],["IEEE International Conference on Services Computing","SCC","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software and System Process","ICSSP","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Engineering and Knowledge Engineering","SEKE","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Quality, Reliability and Security","QRS","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Software Reuse","ICSR","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Web Engineering","ICWE","C","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Model Checking of Software","SPIN","C","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Automated Technology for Verification and Analysis","ATVA","C","conf","软件工程/系统软件/程序设计语言"],["International Symposium on Logic-based Program Synthesis and Transformation","LOPSTR","C","conf","软件工程/系统软件/程序设计语言"],["Theoretical Aspects of Software Engineering Conference","TASE","C","conf","软件工程/系统软件/程序设计语言"],["Mining Software Repositories","MSR","C","conf","软件工程/系统软件/程序设计语言"],["Requirements Engineering: Foundation for Software Quality","REFSQ","C","conf","软件工程/系统软件/程序设计语言"],["Working IEEE/IFIP Conference on Software Architecture","WICSA","C","conf","软件工程/系统软件/程序设计语言"],["Asia-Pacific Symposium on Internetware","Internetware","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Runtime Verification","RV","C","conf","软件工程/系统软件/程序设计语言"],["International Conference on Formal Methods and Models for  Co-Design","MEMOCODE","C","conf","软件工程/系统软件/程序设计语言"]],"warn":[["Wireless Personal Communications","论文工厂"],["Natural Resources Forum","论文工厂"],["Computers & Electrical Engineering","论文工厂"],["NUMERICAL HEAT TRANSFER PART A-APPLICATIONS","论文工厂"],["SCALABLE COMPUTING-PRACTICE AND EXPERIENCE","论文工厂"]],"ops":{"European Journal of Operational Research":"A","INFORMS Journal on Computing":"A","Management Science":"A","Mathematical Programming":"A","Mathematics of Operations Research":"A","Operations Research":"A","Annals of Operations Research":"B","Computers & Industrial Engineering":"B","Computers & Operations Research":"B","Decision Analysis":"B","Decision Sciences":"B","Fuzzy Optimization and Decision Making":"B","Group Decision and Negotiation":"B","IEEE Transactions on Cybernetics":"B","IEEE Transactions on Evolutionary Computation":"B","INFORMS Journal on Applied Analytics":"B","INFORMS Journal on Optimization":"B","International Journal of Forecasting":"B","Journal of Heuristics":"B","Journal of Management Science and Engineering":"B","Journal of Optimization Theory and Applications":"B","Journal of Scheduling":"B","Journal of the Operational Research Society":"B","Judgment and Decision Making":"B","Naval Research Logistics":"B","Omega":"B","Operations Research Letters":"B","OR Spectrum":"B","SIAM Journal on Computing":"B","SIAM Journal on Optimization":"B","Asia-Pacific Journal of Operational Research":"C","Computational Optimization and Applications":"C","Decision":"C","Evolutionary Computation":"C","Flexible Services and Manufacturing Journal":"C","Grey Systems:Theory and Application":"C","International Journal of General Systems":"C","International Transactions in Operational Research":"C","Journal of Forecasting":"C","Journal of Global Optimization":"C","Journal of Grey System":"C","Journal of Management Analytics":"C","Journal of Systems Engineering and Electronics":"C","Journal of Systems Science and Complexity":"C","Mathematical Methods of Operations Research":"C","Stochastic Systems":"C","System Dynamics Review":"C","Systems Research and Behavioral Science":"C","Central European Journal of Operations Research":"D","Computational Management Science":"D","INFOR":"D","Journal of Data, Information and Management":"D","Journal of Multi-Criteria Decision Analysis":"D","Journal of Systems Science and Information":"D","Journal of the Operations Research Society of China":"D","Optimization":"D"},"aero":{"Acta Astronautica":"T1","AIAA Journal":"T1","Chinese Journal of Aeronautics":"T1","IEEE Transactions on Aerospace and Electronic Systems":"T1","Journal of Astronomical Telescopes Instruments and Systems":"T1","Journal of Guidance, Control, and Dynamics":"T1","Journal of Propulsion and Power":"T1","Progress in Aerospace Sciences":"T1","Space Science Reviews":"T1","航空学报":"T1","宇航学报":"T1","Aircraft Engineering and Aerospace Technology":"T2","Canadian Journal of Remote Sensing":"T2","IEEE Aerospace and Electronic Systems Magazine":"T2","International Journal of Aerospace Engineering":"T2","Journal of Aerospace Engineering":"T2","Journal of Aircraft":"T2","Journal of American Helicopter Society":"T2","Journal of Navigation":"T2","Journal of Spacecraft and Rockets":"T2","Journal of Systems Engineering and Electronics":"T2","Journal of the Astronautical Sciences":"T2","Microgravity Science and Technology":"T2","Navigation-Journal of the Institute of Navigation":"T2","NPJ Microgravity":"T2","Propulsion and Power Research":"T2","北京航空航天大学学报":"T2","航空材料学报":"T2","航空动力学报":"T2","南京航空航天大学学报":"T2","推进技术":"T2","系统工程与电子技术":"T2","中国空间科学技术":"T2","Advances in Aerodynamics":"T3","Advances in Space Research":"T3","Aerospace Science and Technology":"T3","Cosmic Research":"T3","International Journal of Aeronautical and Space Sciences":"T3","International Journal of Micro Air Vehicles":"T3","International Journal of Turbo & Jet-Engines":"T3","Journal of Aerospace Information Systems":"T3","The Aeronautical Journal":"T3","The International Journal of Aeroacoustics":"T3","Unmanned Systems":"T3","电光与控制":"T3","固体火箭技术":"T3","航空兵器":"T3","航空制造技术":"T3","航天控制":"T3","航天器工程":"T3","空间科学学报":"T3","空气动力学学报":"T3","上海航天":"T3","实验流体力学":"T3","系统仿真学报":"T3","宇航材料工艺":"T3","振动测试与诊断":"T3","中国惯性技术学报":"T3","植物科学领域高质量期刊分级目录":"T3","Annual Review of Phytopathology":"T3","Annual Review of Plant Biology":"T3","Ecological Monographs":"T3"}};


const BUILTIN_CARDS = [
  { id: 'arxiv', name: 'arXiv 资讯', icon: 'newspaper', size: { w: 2, h: 4 } },
  { id: 'pomo', name: '番茄钟', icon: 'timer', size: { w: 2, h: 3 } },
  { id: 'calendar', name: '日历', icon: 'calendar-days', size: { w: 2, h: 3 } },
  { id: 'tasks', name: '今日待办', icon: 'list-checks', size: { w: 2, h: 3 } },
  { id: 'libstats', name: '文献统计', icon: 'book-open', size: { w: 2, h: 2 } },
  { id: 'focusbars', name: '专注趋势', icon: 'flame', size: { w: 2, h: 2 } },
  { id: 'topics', name: '研究方向', icon: 'compass', size: { w: 4, h: 2 } },
  { id: 'survey', name: '综述进度', icon: 'pen-line', size: { w: 2, h: 3 } },
  { id: 'launch', name: '快速启动', icon: 'rocket', size: { w: 4, h: 2 } },
  { id: 'recent', name: '最近文献', icon: 'library', size: { w: 2, h: 3 } },
];

const CUSTOM_TYPES = {
  note: { name: '笔记嵌入', icon: 'sticky-note', cfg: { path: '' } },
  countdown: { name: '倒计时 / DDL', icon: 'alarm-clock', cfg: { label: '投稿截止', date: '' } },
  web: { name: '网页', icon: 'globe', cfg: { url: 'https://arxiv.org/list/cs.AI/recent' } },
  commands: { name: '命令组', icon: 'terminal', cfg: { ids: '', labels: '' } },
};

const DEFAULT_SETTINGS = {
  libFolder: '科研工作台/文献',
  pdfFolder: '科研工作台/PDF',
  questionsFolder: '科研工作台/研究问题',
  submissionsFolder: '科研工作台/投稿',
  inboxFolder: '科研工作台/收件箱',
  graphCanvas: '科研工作台/论文图谱.canvas',
  dailyFolder: '',
  surveyNote: '科研工作台/综述大纲.md',
  basesFolder: '科研工作台/Bases',
  pomoWork: 25, pomoBreak: 5, pomoLongBreak: 15, pomoLongEvery: 4,
  researchStart: '',
  topics: [...DEFAULT_TOPICS],
  layout: {},
  hiddenCards: [], customCards: [], cardTitles: {}, cardCfg: {},
  pomoLog: {},
  sidebarMode: 'full', /* full | icon | hidden */
  accent: 'blue', accentCustom: '', glass: true,
  blurPx: 18, cardAlpha: 70, radiusPx: 16, gapPx: 14, bgDim: 30, columns: DEFAULT_COLS,
  bgMode: 'image', bgColor: '#e8edf7', bgImage: '',
  arxivQuery: 'all:"satellite scheduling" OR all:"earth observation scheduling"',
  arxivMax: 8, arxivCache: null,
  ai: { baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' },
  mineruCmd: 'mineru',
};

/* ---------- 工具 ---------- */

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
function todayKey() { return window.moment().format('YYYY-MM-DD'); }
function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}
function guessFromFilename(fn) {
  const base = fn.replace(/\.pdf$/i, '');
  const yearMatch = base.match(/(19|20)\d{2}/);
  const year = yearMatch ? yearMatch[0] : '';
  const title = base.replace(/[_]+/g, ' ').replace(/\(\d{4}\)/g, '').replace(/\s{2,}/g, ' ').trim();
  return { title: title || base, year };
}
function isExternalPath(p) { return /^[A-Za-z]:[\\/]/.test(p) || /^\\\\/.test(p); }
function isHttp(p) { return /^https?:\/\//i.test(p); }
function toPosix(p) { return String(p).replace(/\\/g, '/'); }

function replaceSection(content, heading, body) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  const block = ['', body.trim(), ''];
  if (start === -1) return `${content.trimEnd()}\n\n## ${heading}\n${block.join('\n')}\n`;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) { end = i; break; }
  }
  lines.splice(start + 1, end - start - 1, ...block);
  return lines.join('\n');
}

function baseFile(filters, views) {
  return [
    `filters:`, `  and:`, ...filters.map((f) => `    - ${f}`),
    `properties:`,
    `  file.name:`, `    displayName: 名称`,
    `  authors:`, `    displayName: 作者`,
    `  year:`, `    displayName: 年份`,
    `  status:`, `    displayName: 状态`,
    `  priority:`, `    displayName: 优先级`,
    `  rating:`, `    displayName: 评分`,
    `  topics:`, `    displayName: 研究方向`,
    `views:`,
    ...views.flatMap((v) => [
      `  - type: table`, `    name: ${v.name}`,
      ...(v.filters ? [`    filters:`, `      and:`, ...v.filters.map((f) => `        - ${f}`)] : []),
      `    order:`, ...v.order.map((o) => `      - ${o}`),
    ]),
  ].join('\n') + '\n';
}

/* ==========================================================================
 * 番茄钟引擎
 * ========================================================================== */

class PomoEngine {
  constructor(plugin) {
    this.plugin = plugin;
    this.phase = 'idle'; this.total = 0; this.left = 0;
    this.completedToday = this.countToday();
    this.listeners = new Set(); this._timer = null;
  }
  onTick(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }
  countToday() { return ((this.plugin.settings.pomoLog || {})[todayKey()] || {}).count || 0; }
  start() {
    const s = this.plugin.settings;
    if (this.phase !== 'idle') return;
    this.phase = 'work'; this.total = s.pomoWork * 60; this.left = this.total;
    this.emit(); this._run();
  }
  _run() {
    this._clear();
    this._timer = window.setInterval(() => {
      this.left -= 1;
      if (this.left <= 0) this._complete(); else this.emit();
    }, 1000);
    this.plugin.registerInterval(this._timer);
  }
  _clear() { if (this._timer) { window.clearInterval(this._timer); this._timer = null; } }
  _complete() {
    this._clear();
    const s = this.plugin.settings;
    if (this.phase === 'work') {
      const log = s.pomoLog || (s.pomoLog = {});
      const t = log[todayKey()] || (log[todayKey()] = { count: 0, minutes: 0 });
      t.count += 1; t.minutes = (t.minutes || 0) + s.pomoWork;
      this.completedToday = t.count;
      this.plugin.saveSettings();
      this.plugin.appendPomoToDaily(s.pomoWork);
      const long = t.count % Math.max(1, s.pomoLongEvery) === 0;
      new Notice(`专注完成！${long ? '休息长一点吧' : `休息 ${s.pomoBreak} 分钟`}`);
      this.phase = long ? 'longbreak' : 'break';
      this.total = (long ? s.pomoLongBreak : s.pomoBreak) * 60;
      this.left = this.total; this._run();
    } else {
      new Notice(' 休息结束，继续冲刺！');
      this.phase = 'idle'; this.left = 0; this.total = 0;
    }
    this.emit();
  }
  reset() { this._clear(); this.phase = 'idle'; this.left = 0; this.total = 0; this.emit(); }
  get progress() { return this.total ? 1 - this.left / this.total : 0; }
  clockText() {
    const m = Math.floor(this.left / 60); const s = this.left % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  phaseText() { return ({ idle: '准备专注', work: '专注中', break: '小憩', longbreak: '长休' })[this.phase] || ''; }
  destroy() { this._clear(); }
}

/* ==========================================================================
 * 右侧工具栏：迷你番茄钟 + 期刊速查 + 快速记想法（与主界面共享引擎）
 * ========================================================================== */

class SidePanelView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._unsub = plugin.pomo.onTick(() => this.renderPomoMini());
  }

  getViewType() { return VIEW_SIDE; }
  getDisplayText() { return 'JRS 工具栏'; }
  getIcon() { return 'panel-right'; }

  async onOpen() { this.render(); }
  onClose() { if (this._unsub) this._unsub(); }

  render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('jrs-side');

    /* ── 迷你番茄钟 ── */
    const pomoCard = root.createEl('section', { cls: 'jrs-card jrs-side-pomo' });
    const ph = pomoCard.createEl('div', { cls: 'od-card-title' });
    setIcon(ph, 'timer');
    ph.createSpan({ text: '番茄钟' });
    /* mini ring：与主页同源可视化 */
    const ringBox = pomoCard.createEl('div', { cls: 'jrs-side-ring' });
    const C = 2 * Math.PI * 40;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 96 96');
    const mk = (cls) => { const c = document.createElementNS(svgNS, 'circle'); c.setAttribute('class', cls); c.setAttribute('cx','48'); c.setAttribute('cy','48'); c.setAttribute('r','40'); return c; };
    const track = mk('od-pomo-track');
    this._miniBar = mk('od-pomo-bar');
    this._miniBar.setAttribute('stroke-dasharray', String(C));
    this._miniBar.setAttribute('stroke-dashoffset', '0');
    this._miniBar.setAttribute('stroke-width', '6');
    track.setAttribute('stroke-width', '6');
    svg.appendChild(track); svg.appendChild(this._miniBar);
    ringBox.appendChild(svg);
    this._miniClock = ringBox.createEl('div', { cls: 'jrs-side-clock' });
    this._miniPhase = pomoCard.createEl('div', { cls: 'od-hint' });
    const pc = pomoCard.createEl('div', { cls: 'jrs-side-pomo-btns' });
    this._miniStart = pc.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm' });
    this._miniStart.onclick = () => {
      const p = this.plugin.pomo;
      if (p.phase === 'idle') p.start(); else p.reset();
    };
    const resetBtn = pc.createEl('button', { cls: 'od-btn od-btn--sm', text: '重置' });
    resetBtn.onclick = () => this.plugin.pomo.reset();
    this._miniCount = pomoCard.createEl('div', { cls: 'od-hint' });
    this.renderPomoMini();

    /* ── 期刊速查 ── */
    const jCard = root.createEl('section', { cls: 'jrs-card' });
    const jh = jCard.createEl('div', { cls: 'od-card-title' });
    setIcon(jh, 'telescope');
    jh.createSpan({ text: '期刊速查' });
    const jInput = jCard.createEl('input', { type: 'text', cls: 'jrs-side-input', attr: { placeholder: '期刊/会议名…' } });
    const jOut = jCard.createEl('div', { cls: 'jrs-lookup-out' });
    let deb = null;
    const badge = (text, cls) => {
      const b = document.createElement('span');
      b.className = 'jrs-zone-badge';
      b.textContent = text;
      b.setAttribute('data-zone', cls);
      return b;
    };
    const runQ = async () => {
      const v = jInput.value.trim();
      jOut.empty();
      if (!v) return;
      const r = await this.plugin.lookupJournal(v);
      if (!r.found) { jOut.createEl('div', { cls: 'od-hint', text: '未收录' }); return; }
      const row = jOut.createEl('div', { cls: 'jrs-side-badges' });
      if (r.cas) row.appendChild(badge(`中科院${r.cas}${r.casTop ? '·Top' : ''}`, r.cas.includes('1区') ? 'top' : 'mid'));
      if (r.xr) row.appendChild(badge(`新锐${r.xr}`, 'cn'));
      if (r.ccf) row.appendChild(badge(`CCF-${r.ccf.grade}`, 'top'));
      if (r.cast) row.appendChild(badge(`科协${r.cast}`, r.cast === 'A' || r.cast === 'T1' ? 'top' : 'mid'));
      if (r.warn) row.appendChild(badge(`${r.warn}`, 'top'));
      if (!row.children.length) row.appendChild(badge('已收录', 'mid'));
    };
    jInput.oninput = () => { if (deb) clearTimeout(deb); deb = setTimeout(runQ, 250); };
    jInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (deb) clearTimeout(deb); runQ(); } };

    /* ── 快速记想法 ── */
    const cCard = root.createEl('section', { cls: 'jrs-card' });
    const ch = cCard.createEl('div', { cls: 'od-card-title' });
    setIcon(ch, 'inbox');
    ch.createSpan({ text: '快速记想法' });
    const cInput = cCard.createEl('textarea', { cls: 'jrs-side-input', attr: { rows: '3', placeholder: '想到什么记什么，落入今日收件箱…' } });
    cInput.style.resize = 'vertical';
    const cBtn = cCard.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '存入收件箱' });
    const cHint = cCard.createEl('div', { cls: 'od-hint' });
    cBtn.onclick = async () => {
      const v = cInput.value.trim();
      if (!v) { new Notice('内容为空'); return; }
      await this.plugin.captureThought(v);
      cInput.value = '';
      cHint.textContent = `${window.moment().format('HH:mm')} 已存`;
      new Notice('已存入今日收件箱 ');
    };
    const inbox = this.plugin.findDailyNote ? null : null;
    const openInbox = cCard.createEl('button', { cls: 'od-btn od-btn--sm od-btn--ghost', text: '查看收件箱' });
    openInbox.onclick = () => this.plugin.openInboxNote();
  }

  renderPomoMini() {
    if (!this._miniClock) return;
    const p = this.plugin.pomo;
    this._miniClock.textContent = p.phase === 'idle'
      ? `${String(this.plugin.settings.pomoWork).padStart(2, '0')}:00`
      : p.clockText();
    if (this._miniBar) {
      const C = 2 * Math.PI * 40;
      this._miniBar.setAttribute('stroke-dashoffset', String(C * p.progress));
      this._miniBar.toggleClass('od-pomo-bar--break', p.phase === 'break' || p.phase === 'longbreak');
    }
    this._miniPhase.textContent = `${p.phaseText()} · 今日 ${p.completedToday} 个 / ${this.plugin.todayPomoMinutes()} 分钟`;
    this._miniStart.textContent = p.phase === 'idle' ? '开始专注' : '停止';
  }
}

/* ==========================================================================
 * 应用壳视图：左侧栏 + Topbar + 区段路由
 * ========================================================================== */

class DashboardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.section = 'home';
    this.calMoment = window.moment();
    this.editing = false;
    this._unsub = plugin.pomo.onTick(() => this.renderPomo());
    this._metrics = { cols: DEFAULT_COLS, colW: 0, rowH: ROW_H, gap: 14, boardW: 0 };
    this._shells = new Map();
    this._ro = null;
    this._panel = null; /* 文献库面板实例 */
  }

  getViewType() { return VIEW_DASHBOARD; }
  getDisplayText() { return 'Jensen 科研工作站'; }
  getIcon() { return 'telescope'; }

  async onOpen() { await this.render(); }
  onClose() {
    if (this._unsub) this._unsub();
    if (this._ro) this._ro.disconnect();
  }

  async goto(section) { this.section = section; await this.render(); }

  async render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('jrs-view');

    const shell = root.createEl('div', { cls: 'jrs-shell' });
    if (this.plugin.settings.sidebarMode !== 'hidden') {
      shell.appendChild(this.buildSidebar());
    }
    const main = shell.createEl('div', { cls: 'jrs-main' });
    if (this.section !== 'home') main.appendChild(this.buildTopbar(this.section === 'library'));

    this._page = main.createEl('div', { cls: 'jrs-page' });
    await this.renderSection(this._page);
  }

  /* ---------- 左侧栏（对标 OS sidebar） ---------- */

  buildSidebar() {
    const mode = this.plugin.settings.sidebarMode;
    const aside = document.createElement('aside');
    aside.className = `jrs-sidebar${mode === 'icon' ? ' is-icon' : ''}`;

    const brand = aside.createEl('div', { cls: 'jrs-brand' });
    const mark = brand.createEl('span', { cls: 'jrs-brand-mark' });
    setIcon(mark, 'telescope');
    if (mode !== 'icon') {
      const copy = brand.createEl('div', { cls: 'jrs-brand-copy' });
      copy.createEl('div', { cls: 'jrs-brand-name', text: 'Jensen 科研工作站' });
      copy.createEl('div', { cls: 'jrs-brand-sub', text: 'Research Workstation' });
    } else {
      brand.setAttribute('title', 'Jensen 科研工作站');
    }

    const nav = aside.createEl('nav', { cls: 'jrs-nav' });
    SECTIONS.forEach((sec) => {
      const b = nav.createEl('button', {
        cls: `jrs-nav-item${this.section === sec.id ? ' is-active' : ''}`,
        attr: { title: sec.label },
      });
      const ic = b.createSpan({ cls: 'jrs-nav-icon' });
      setIcon(ic, sec.icon);
      if (mode !== 'icon') b.createSpan({ cls: 'jrs-nav-label', text: sec.label });
      b.onclick = () => this.goto(sec.id);
    });

    const bottom = aside.createEl('div', { cls: 'jrs-sidebar-bottom' });
    if (mode !== 'icon') {
      const papers = this.plugin.getPapers();
      bottom.createEl('div', { cls: 'jrs-meta-label', text: '当前文献库' });
      bottom.createEl('div', { cls: 'jrs-vault-name', text: this.app.vault.getName() });
      bottom.createEl('div', {
        cls: 'jrs-vault-stats',
        text: `${papers.length} 篇文献 · ${papers.filter((x) => x.status === '阅读中').length} 篇阅读中`,
      });
    }
    const collapse = bottom.createEl('button', { cls: 'jrs-nav-item jrs-sidebar-toggle', attr: { title: '切换侧栏宽度' } });
    const cic = collapse.createSpan({ cls: 'jrs-nav-icon' });
    setIcon(cic, mode === 'icon' ? 'chevrons-right' : 'chevrons-left');
    collapse.onclick = async () => {
      this.plugin.settings.sidebarMode = mode === 'icon' ? 'full' : 'icon';
      await this.plugin.saveSettings();
      this.render();
    };
    return aside;
  }

  /* ---------- Topbar（对标 OS：标题 + 副标题 + 搜索 + 主按钮） ---------- */

  buildTopbar(omitSearch = false) {
    const sec = SECTIONS.find((s) => s.id === this.section) || SECTIONS[0];
    const bar = document.createElement('header');
    bar.className = 'jrs-topbar';

    const title = bar.createEl('div', { cls: 'jrs-page-title' });
    title.createEl('h1', { text: sec.title });
    title.createEl('p', { text: sec.sub });

    const tools = bar.createEl('div', { cls: 'jrs-tools' });
    if (!omitSearch) {
      const omni = tools.createEl('div', { cls: 'jrs-omnibox' });
      this.buildOmnibox(omni);
    }

    const primary = tools.createEl('button', { cls: 'od-btn od-btn--primary' });
    let pIcon = 'plus'; let pLabel = '手动添加';
    if (this.section === 'discover') { pIcon = 'refresh-cw'; pLabel = '立即发现'; }
    if (this.section === 'progress') { pIcon = 'sprout'; pLabel = 'AI 综述'; }
    if (this.section === 'graph') { pIcon = 'git-fork'; pLabel = '重建图谱'; }
    if (this.section === 'queue') { pIcon = 'list-plus'; pLabel = '添加文献'; }
    if (this.section === 'reader') { pIcon = 'columns-2'; pLabel = '继续上次阅读'; }
    if (this.section === 'submit') { pIcon = 'plus'; pLabel = '新建投稿'; }
    if (this.section === 'ask') { pIcon = 'inbox'; pLabel = '快速记想法'; }
    setIcon(primary.createSpan(), pIcon);
    primary.createSpan({ text: pLabel });
    primary.onclick = async () => {
      if (this.section === 'discover') { new Notice('正在抓取 arXiv 最新论文…'); await this.plugin.fetchArxiv(true); this.render(); return; }
      if (this.section === 'progress') { new AiSynthesisModal(this.plugin).open(); return; }
      if (this.section === 'graph') { await this.plugin.generateGraphCanvas(true); this.render(); return; }
      if (this.section === 'reader') { this.continueLastReading(); return; }
      if (this.section === 'submit') { new AddSubmissionModal(this.plugin, () => this.render()).open(); return; }
      if (this.section === 'ask') { new CaptureModal(this.plugin).open(); return; }
      new AddPaperModal(this.plugin, () => this.render()).open();
    };
    return bar;
  }

  continueLastReading() {
    const reading = this.plugin.getPapers().filter((p) => p.status === '阅读中');
    const target = reading[0] || this.plugin.getPapersSorted('added')[0];
    if (!target) { new Notice('文献库为空'); return; }
    this.plugin.openReading(target);
  }

  buildOmnibox(host) {
    const box = host.createEl('div', { cls: 'od-search jrs-omnibox-box' });
    setIcon(box.createSpan(), 'search');
    const input = box.createEl('input', { type: 'text', placeholder: '搜索笔记 / 文献 / 命令…' });
    box.createEl('span', { cls: 'jrs-omni-kbd', text: '↵' });
    const panel = host.createEl('div', { cls: 'jrs-omnibox-panel' });
    let active = -1; let items = [];
    const run = (sel) => {
      const it = items[sel];
      if (it) { it.run(); input.value = ''; panel.empty(); panel.removeClass('is-open'); input.blur(); }
    };
    input.oninput = () => {
      const q = input.value.trim().toLowerCase();
      panel.empty(); items = []; active = -1;
      if (!q) { panel.removeClass('is-open'); return; }
      const group = (label) => { panel.createEl('div', { cls: 'jrs-omni-group', text: label }); return panel.createEl('div'); };
      const files = this.app.vault.getMarkdownFiles()
        .filter((f) => f.basename.toLowerCase().includes(q) || (f.parent?.path || '').toLowerCase().includes(q)).slice(0, 5);
      if (files.length) {
        const list = group('笔记');
        files.forEach((f) => {
          const item = list.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'file-text');
          item.createSpan({ cls: 'jrs-omni-text', text: f.basename });
          item.createSpan({ cls: 'jrs-omni-sub', text: f.parent?.path || '' });
          const idx = items.length; item.onclick = () => run(idx);
          items.push({ run: () => this.app.workspace.getLeaf('tab').openFile(f), el: item });
        });
      }
      const papersHit = this.plugin.getPapers().filter((p) => p.title.toLowerCase().includes(q)).slice(0, 4);
      if (papersHit.length) {
        const list = group('文献');
        papersHit.forEach((p) => {
          const item = list.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'book-open');
          item.createSpan({ cls: 'jrs-omni-text', text: p.title.length > 42 ? p.title.slice(0, 42) + '…' : p.title });
          item.createSpan({ cls: 'jrs-omni-sub', text: p.status });
          const idx = items.length; item.onclick = () => run(idx);
          items.push({ run: () => this.plugin.openPaper(p), el: item });
        });
      }
      const cmds = Object.entries(this.app.commands.commands)
        .filter(([cid, c]) => cid.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q)).slice(0, 6);
      if (cmds.length) {
        const list = group('命令');
        cmds.forEach(([cid, c]) => {
          const item = list.createEl('div', { cls: 'jrs-omni-item' });
          setIcon(item.createSpan(), 'terminal');
          item.createSpan({ cls: 'jrs-omni-text', text: c.name || cid });
          item.createSpan({ cls: 'jrs-omni-sub', text: cid.split(':')[0] });
          const idx = items.length; item.onclick = () => run(idx);
          items.push({ run: () => this.app.commands.executeCommandById(cid), el: item });
        });
      }
      if (!items.length) panel.createEl('div', { cls: 'jrs-omni-empty', text: `没有匹配「${input.value.trim()}」的结果` });
      panel.addClass('is-open');
    };
    input.onkeydown = (e) => {
      if (!items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); }
      else if (e.key === 'Enter') { e.preventDefault(); run(active >= 0 ? active : 0); return; }
      else if (e.key === 'Escape') { panel.removeClass('is-open'); input.blur(); return; }
      else return;
      items.forEach((it, i) => it.el.toggleClass('is-active', i === active));
    };
    input.onblur = () => window.setTimeout(() => panel.removeClass('is-open'), 150);
  }

  /* ---------- 区段路由 ---------- */

  async renderSection(page) {
    switch (this.section) {
      case 'home': return this.renderHome(page);
      case 'discover': return this.renderDiscover(page);
      case 'queue': return this.renderQueue(page);
      case 'library': return this.renderLibrarySection(page);
      case 'graph': return await this.renderGraph(page);
      case 'progress': return await this.renderProgress(page);
      case 'reader': return this.renderReader(page);
      case 'submit': return this.renderSubmit(page);
      case 'ask': return this.renderAsk(page);
      default: return this.renderHome(page);
    }
  }

  /* ========== 区段：总览（Hero + 自由看板，v0.3 保留） ========== */

  async renderHome(page) {
    this.packLayout();
    page.appendChild(this.buildHero());
    this._board = page.createEl('div', { cls: 'jrs-board' });
    if (this.editing) this._board.addClass('is-editing');
    this._shells.clear();
    for (const def of this.visibleCards()) {
      try {
        const shell = await this.buildShell(def);
        this._board.appendChild(shell);
        this._shells.set(def.id, shell);
      } catch (e) { console.error(`[JRS] 卡片「${def.id}」渲染失败`, e); }
    }
    this.computeMetrics();
    this.applyPositions();
    this.setupBoardObserver();
    this.plugin.ensureArxivFresh().then((r) => { if (r?.justFetched) this.softRefresh('arxiv'); });
  }

  cardDef(id) {
    const b = BUILTIN_CARDS.find((c) => c.id === id);
    if (b) return { id, name: b.name, icon: b.icon, size: { ...b.size }, custom: null };
    const c = this.plugin.settings.customCards.find((x) => `c:${c.uid}` === id);
    if (c) {
      const t = CUSTOM_TYPES[c.type] || {};
      return { id, name: c.title || t.name || '卡片', icon: t.icon || 'square', size: { w: 2, h: 2 }, custom: c };
    }
    return null;
  }

  visibleCards() {
    const s = this.plugin.settings;
    return [
      ...BUILTIN_CARDS.map((c) => c.id),
      ...s.customCards.map((c) => `c:${c.uid}`),
    ]
      .filter((id) => !s.hiddenCards.includes(id) && (id !== 'survey' || this.plugin.surveyExists()))
      .map((id) => this.cardDef(id))
      .filter(Boolean);
  }

  layoutOf(id) {
    const s = this.plugin.settings;
    if (!s.layout[id]) s.layout[id] = { ...this.cardDef(id).size, x: -1, y: -1 };
    return s.layout[id];
  }

  packLayout() {
    const s = this.plugin.settings;
    const cols = s.columns;
    const colBottom = new Array(cols).fill(0);
    let changed = false;
    for (const def of this.visibleCards()) {
      const l = this.layoutOf(def.id);
      if (l.x >= 0 && l.y >= 0) {
        const w = Math.min(Math.max(l.w, 1), cols);
        for (let c = l.x; c < Math.min(l.x + w, cols); c += 1) colBottom[c] = Math.max(colBottom[c], l.y + l.h);
        continue;
      }
      const w = Math.min(Math.max(l.w, 1), cols);
      const h = Math.max(l.h, 1);
      let bx = 0; let by = Number.MAX_SAFE_INTEGER;
      for (let x = 0; x + w <= cols; x += 1) {
        let y = 0;
        for (let c = x; c < x + w; c += 1) y = Math.max(y, colBottom[c]);
        if (y < by) { by = y; bx = x; }
      }
      if (by === Number.MAX_SAFE_INTEGER) { by = 0; bx = 0; }
      l.x = bx; l.y = by; l.w = w; l.h = h;
      for (let c = bx; c < bx + w; c += 1) colBottom[c] = by + h;
      changed = true;
    }
    if (changed) this.plugin.saveSettings();
  }

  computeMetrics() {
    const s = this.plugin.settings;
    const boardW = this._board ? this._board.clientWidth : 1000;
    const gap = s.gapPx;
    /* 自适应列数：colW 低于 90px 时自动降列，保底 2 列 */
    let cols = s.columns;
    const minColW = 90;
    const fitCols = Math.max(2, Math.floor((boardW + gap) / (minColW + gap)));
    if (cols > fitCols) cols = fitCols;
    const colW = Math.max(40, (boardW - (cols - 1) * gap) / cols);
    this._metrics = { cols, colW, rowH: ROW_H, gap, boardW };
    /* 列数减少后：越界卡重排 */
    if (cols < s.columns) {
      for (const def of this.visibleCards()) {
        const l = this.layoutOf(def.id);
        if (l.x >= 0 && l.x + Math.min(l.w, cols) > cols) { l.x = -1; l.y = -1; }
      }
      this.packLayout();
    }
  }

  positionShell(shell, l) {
    const { colW, rowH, gap, cols } = this._metrics;
    const w = Math.min(l.w, cols);
    if (l.x + w > cols) l.x = Math.max(0, cols - w);
    shell.style.left = `${l.x * (colW + gap)}px`;
    shell.style.top = `${l.y * (rowH + gap)}px`;
    shell.style.width = `${w * colW + (w - 1) * gap}px`;
    shell.style.height = `${l.h * rowH + (l.h - 1) * gap}px`;
  }

  applyPositions() { for (const [id, shell] of this._shells) this.positionShell(shell, this.layoutOf(id)); }

  setupBoardObserver() {
    if (this._ro) this._ro.disconnect();
    this._ro = new ResizeObserver(() => { this.computeMetrics(); this.applyPositions(); });
    this._ro.observe(this._board);
    /* resize 监听只注册一次（防泄漏：旧句柄先卸） */
    if (this._wsResizeRef) this.app.workspace.offref(this._wsResizeRef);
    this._wsResizeRef = this.app.workspace.on('resize', () => { this.computeMetrics(); this.applyPositions(); });
    this.registerEvent(this._wsResizeRef);
  }

  async buildShell(def) {
    const s = this.plugin.settings;
    const shell = document.createElement('section');
    shell.className = 'jrs-card-shell od-card od-anim';
    shell.dataset.cardId = def.id;
    const head = shell.createEl('div', { cls: 'od-card-head jrs-card-handle' });
    const t = head.createEl('div', { cls: 'od-card-title' });
    setIcon(t, def.icon);
    t.createSpan({ text: s.cardTitles[def.id] || def.name });
    const ctrl = head.createEl('div', { cls: 'od-card-ctrl' });
    const cfgBtn = ctrl.createEl('button', { cls: 'od-icon-btn', title: '卡片设置' });
    setIcon(cfgBtn, 'settings-2');
    cfgBtn.onclick = (e) => { e.stopPropagation(); new CardConfigModal(this.plugin, def, () => this.goto('home')).open(); };
    const hideBtn = ctrl.createEl('button', { cls: 'od-icon-btn', title: '隐藏卡片' });
    setIcon(hideBtn, 'eye-off');
    hideBtn.onclick = async (e) => {
      e.stopPropagation();
      s.hiddenCards.push(def.id);
      await this.plugin.saveSettings();
      this.goto('home');
    };
    const body = shell.createEl('div', { cls: 'jrs-card-body' });
    const content = await this.renderCardContent(def.id, body);
    if (content && content !== body) body.appendChild(content);
    shell.createEl('div', { cls: 'jrs-resize' });
    this.bindCardDrag(shell, def.id);
    return shell;
  }

  bindCardDrag(shell, id) {
    shell.addEventListener('pointerdown', (e) => {
      if (!this.editing || e.button !== 0) return;
      const onResize = e.target instanceof Element && !!e.target.closest('.jrs-resize');
      const l = this.layoutOf(id);
      const { colW, rowH, gap, cols } = this._metrics;
      const startX = e.clientX; const startY = e.clientY;
      const orig = { x: l.x, y: l.y, w: l.w, h: l.h };
      shell.setPointerCapture(e.pointerId);
      shell.addClass('jrs-card--lift');
      const move = (ev) => {
        const dx = ev.clientX - startX; const dy = ev.clientY - startY;
        if (onResize) {
          l.w = Math.min(cols, Math.max(1, Math.round(orig.w + dx / (colW + gap))));
          l.h = Math.max(1, Math.round(orig.h + dy / (rowH + gap)));
        } else {
          l.x = Math.min(Math.max(0, Math.round(orig.x + dx / (colW + gap))), cols - Math.min(l.w, cols));
          l.y = Math.max(0, Math.round(orig.y + dy / (rowH + gap)));
        }
        this.positionShell(shell, l);
      };
      const up = async () => {
        shell.removeEventListener('pointermove', move);
        shell.removeEventListener('pointerup', up);
        shell.removeEventListener('pointercancel', up);
        shell.removeClass('jrs-card--lift');
        await this.plugin.saveSettings();
      };
      shell.addEventListener('pointermove', move);
      shell.addEventListener('pointerup', up);
      shell.addEventListener('pointercancel', up);
    });
    shell.addEventListener('dblclick', () => {
      if (this.editing) new CardConfigModal(this.plugin, this.cardDef(id), () => this.goto('home')).open();
    });
  }

  async softRefresh(id) {
    if (this.section !== 'home') return;
    const shell = this._shells.get(id);
    if (!shell) return;
    const def = this.cardDef(id);
    if (!def) return;
    const fresh = await this.buildShell(def);
    shell.replaceWith(fresh);
    this._shells.set(id, fresh);
    this.applyPositions();
  }

  toggleEditing() {
    this.editing = !this.editing;
    this.render();
    new Notice(this.editing ? '排版模式：拖动移动 / 右下角缩放 / 双击设置' : '已退出排版模式');
  }

  buildHero() {
    const s = this.plugin.settings;
    const h = document.createElement('header');
    h.addClass('jrs-hero', 'jrs-hero-center', 'od-anim');

    /* 标题（居中） */
    const brand = h.createEl('div', { cls: 'jrs-hero-brand' });
    const logo = brand.createEl('span', { cls: 'jrs-hero-logo' });
    setIcon(logo, 'telescope');
    brand.createEl('h1', { cls: 'jrs-hero-name', text: 'Jensen 科研工作站' });

    /* 副标题 */
    const hour = window.moment().hour();
    const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
    const papers = this.plugin.getPapers();
    const todo = papers.filter((p) => p.status === '待读').length;
    const reading = papers.filter((p) => p.status === '阅读中').length;
    const wd = '日一二三四五六'[window.moment().day()];
    let sub = `${greet}，Jensen · ${window.moment().format('M月D日')} 星期${wd}`;
    if (s.researchStart && window.moment(s.researchStart, 'YYYY-MM-DD').isValid()) {
      sub += ` · 科研第 ${window.moment().diff(window.moment(s.researchStart, 'YYYY-MM-DD'), 'days') + 1} 天`;
    }
    sub += ` · 待读 ${todo} / 阅读中 ${reading} · 今日专注 ${this.plugin.todayPomoMinutes()} 分钟`;
    h.createEl('div', { cls: 'jrs-hero-sub', text: sub });

    /* 搜索框（标题正下方，居中） */
    const omni = h.createEl('div', { cls: 'jrs-hero-omni' });
    this.buildOmnibox(omni);

    /* 操作行（居中） */
    const actions = h.createEl('div', { cls: 'od-header-actions jrs-hero-actions' });
    const mkBtn = (cls, icon, label, fn) => {
      const b = actions.createEl('button', { cls });
      setIcon(b.createSpan(), icon);
      b.createSpan({ text: label });
      b.onclick = fn;
      return b;
    };
    mkBtn('od-btn od-btn--primary', 'library', '文献库', () => this.goto('library'));
    mkBtn('od-btn', 'file-plus', '添加', () => new AddPaperModal(this.plugin, () => this.goto('home')).open());
    mkBtn('od-btn', 'import', '导入', () => new ImportFolderModal(this.plugin, () => this.goto('home')).open());
    mkBtn('od-btn', 'layout-panel-left', '卡片', () => new CardManagerModal(this.plugin, () => this.goto('home')).open());
    mkBtn('od-btn', 'bot', '知识问答', () => this.goto('ask'));
    mkBtn('od-btn', 'target', '投稿冲刺', () => this.goto('submit'));
    const editBtn = actions.createEl('button', { cls: `od-btn jrs-edit-toggle${this.editing ? ' is-on' : ''}` });
    setIcon(editBtn.createSpan(), this.editing ? 'check' : 'layout-grid');
    editBtn.createSpan({ text: this.editing ? '完成排版' : '排版' });
    editBtn.onclick = () => this.toggleEditing();
    return h;
  }

  async renderCardContent(id, body) {
    switch (id) {
      case 'pomo': return this.buildPomoCard(body);
      case 'calendar': return this.buildCalendar(body);
      case 'tasks': return await this.buildTasks(body);
      case 'arxiv': return this.buildArxiv(body);
      case 'libstats': return this.buildLibStats(body);
      case 'focusbars': return this.buildFocusBars(body);
      case 'topics': return this.buildTopics(body);
      case 'survey': return await this.buildSurvey(body);
      case 'launch': return this.buildLaunch(body);
      case 'recent': return this.buildRecent(body);
      default:
        if (id.startsWith('c:')) return await this.buildCustom(body, id);
        return null;
    }
  }

  buildPomoCard(body) {
    const p = this.plugin.pomo;
    const box = body.createEl('div', { cls: 'od-pomo' });
    const ring = box.createEl('div', { cls: 'od-pomo-ring' });
    const C = 2 * Math.PI * 62;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 148 148');
    const mk = (cls) => {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('class', cls);
      c.setAttribute('cx', '74'); c.setAttribute('cy', '74'); c.setAttribute('r', '62');
      return c;
    };
    const track = mk('od-pomo-track');
    const bar = mk('od-pomo-bar');
    bar.setAttribute('stroke-dasharray', String(C));
    bar.setAttribute('stroke-dashoffset', '0');
    this._pomoBar = bar;
    svg.appendChild(track); svg.appendChild(bar);
    ring.appendChild(svg);
    const mid = ring.createEl('div', { cls: 'od-pomo-time' });
    this._pomoClock = mid.createEl('div', { cls: 'od-pomo-clock' });
    this._pomoPhase = mid.createEl('div', { cls: 'od-pomo-phase' });
    const ctrl = box.createEl('div', { cls: 'od-pomo-controls' });
    this._pomoStart = ctrl.createEl('button', { cls: 'od-btn od-btn--primary' });
    const reset = ctrl.createEl('button', { cls: 'od-btn od-btn--ghost' });
    setIcon(reset.createSpan(), 'rotate-ccw');
    reset.append('重置');
    reset.onclick = () => p.reset();
    this._pomoStart.onclick = () => { if (p.phase === 'idle') p.start(); else p.reset(); };
    this._pomoCount = box.createEl('div', { cls: 'od-pomo-count' });
    this.renderPomo();
    return box;
  }

  renderPomo() {
    if (!this._pomoClock) return;
    const p = this.plugin.pomo;
    this._pomoClock.textContent = p.phase === 'idle'
      ? `${String(this.plugin.settings.pomoWork).padStart(2, '0')}:00` : p.clockText();
    this._pomoPhase.textContent = p.phaseText();
    this._pomoStart.textContent = '';
    setIcon(this._pomoStart.createSpan(), p.phase === 'idle' ? 'play' : 'pause');
    this._pomoStart.append(p.phase === 'idle' ? '开始专注' : '停止');
    const C = 2 * Math.PI * 62;
    if (this._pomoBar) {
      this._pomoBar.setAttribute('stroke-dashoffset', String(C * p.progress));
      this._pomoBar.toggleClass('od-pomo-bar--break', p.phase === 'break' || p.phase === 'longbreak');
    }
    const min = this.plugin.todayPomoMinutes();
    this._pomoCount.innerHTML = `今日 <b>${p.completedToday}</b> 个番茄 · 共 <b>${min}</b> 分钟`;
  }

  buildCalendar(body) {
    const nav = body.createEl('div', { cls: 'od-cal-nav' });
    const prev = nav.createEl('button', { cls: 'od-cal-arrow' });
    setIcon(prev, 'chevron-left');
    const title = nav.createEl('div', { cls: 'od-cal-title' });
    const next = nav.createEl('button', { cls: 'od-cal-arrow' });
    setIcon(next, 'chevron-right');
    const mount = body.createEl('div');
    const rerender = () => {
      mount.empty();
      mount.appendChild(this.calGrid());
      mount.appendChild(this.calLegend());
      title.textContent = this.calMoment.format('YYYY年M月');
    };
    prev.onclick = () => { this.calMoment.subtract(1, 'month'); rerender(); };
    next.onclick = () => { this.calMoment.add(1, 'month'); rerender(); };
    rerender();
    return mount;
  }

  calGrid() {
    const grid = document.createElement('div');
    grid.className = 'od-cal';
    '日一二三四五六'.split('').forEach((d) => grid.createEl('div', { cls: 'od-cal-dow', text: d }));
    const m = this.calMoment.clone().startOf('month');
    const todayM = window.moment();
    for (let i = 0; i < m.day(); i += 1) grid.createEl('div', { cls: 'od-cal-day od-cal-day--other' });
    for (let d = 1; d <= m.daysInMonth(); d += 1) {
      const dayM = m.clone().date(d);
      const key = dayM.format('YYYY-MM-DD');
      const btn = grid.createEl('button', { cls: 'od-cal-day', text: String(d) });
      if (dayM.isSame(todayM, 'day')) btn.addClass('od-cal-day--today');
      if (this.plugin.findDailyNote(key)) { btn.addClass('od-cal-day--has-note'); btn.createEl('i', { cls: 'dot' }); }
      if (((this.plugin.settings.pomoLog || {})[key] || {}).minutes > 0) btn.createEl('i', { cls: 'dot dot--pomo' });
      btn.onclick = () => this.plugin.openDailyNote(key);
    }
    return grid;
  }

  calLegend() {
    const lg = document.createElement('div');
    lg.className = 'od-cal-legend';
    const s1 = lg.createEl('span');
    const i1 = s1.createEl('i'); i1.style.background = 'var(--od-accent)';
    s1.append('有日记');
    const s2 = lg.createEl('span');
    const i2 = s2.createEl('i'); i2.style.background = 'var(--od-ok)';
    s2.append('有专注');
    return lg;
  }

  async buildTasks(body) {
    const tasks = await this.plugin.getTodayTasks();
    const list = body.createEl('div', { cls: 'od-tasks jrs-fill' });
    if (!tasks.length) list.createEl('div', { cls: 'od-task-empty', text: '今天还没有待办，添加一条开始科研吧' });
    tasks.forEach((t) => {
      const row = list.createEl('label', { cls: `od-task${t.done ? ' is-done' : ''}` });
      const cb = row.createEl('input', { type: 'checkbox' });
      cb.checked = t.done;
      cb.onclick = async (e) => {
        e.stopPropagation();
        await this.plugin.toggleDailyTask(t);
        this.softRefresh('tasks');
      };
      row.createEl('span', { cls: 'od-task-text', text: t.text });
      row.onclick = () => this.plugin.openDailyNote();
    });
    const inputRow = body.createEl('div', { cls: 'jrs-task-add' });
    const input = inputRow.createEl('input', { type: 'text', placeholder: '快速添加待办，回车确认…' });
    const btn = inputRow.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '添加' });
    const submit = async () => {
      const v = input.value.trim();
      if (!v) { new Notice('请输入待办内容'); input.focus(); return; }
      await this.plugin.appendDailyTask(v);
      this.softRefresh('tasks');
    };
    btn.onclick = submit;
    input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
    return body;
  }

  buildArxiv(body) {
    const cache = this.plugin.settings.arxivCache;
    const head = body.createEl('div', { cls: 'jrs-arxiv-head' });
    head.createEl('span', { cls: 'od-hint', text: `关键词：${this.plugin.settings.arxivQuery}` });
    const rb = head.createEl('button', { cls: 'od-btn od-btn--sm' });
    setIcon(rb.createSpan(), 'refresh-cw');
    rb.append('刷新');
    rb.onclick = async () => { await this.plugin.fetchArxiv(true); this.softRefresh('arxiv'); };
    if (!cache?.items?.length) {
      body.createEl('div', { cls: 'od-task-empty', text: '暂无数据，点「刷新」或到「AI 发现」区段检索' });
      return body;
    }
    const list = body.createEl('div', { cls: 'jrs-arxiv-list jrs-fill' });
    cache.items.slice(0, this.plugin.settings.arxivMax).forEach((it) => {
      const row = list.createEl('div', { cls: 'jrs-arxiv-item' });
      const main = row.createEl('div', { cls: 'jrs-arxiv-main' });
      const title = main.createEl('div', { cls: 'jrs-arxiv-title', text: it.title });
      title.onclick = () => window.open(it.url);
      main.createEl('div', { cls: 'od-hint', text: `${it.date} · ${it.authors}` });
      const add = row.createEl('button', { cls: 'od-icon-btn', title: '加入文献库' });
      setIcon(add, 'plus');
      add.onclick = async () => { await this.plugin.arxivToLibrary(it); new Notice('已加入文献库 '); };
    });
    return body;
  }

  buildLibStats(body) {
    const papers = this.plugin.getPapers();
    const by = (s) => papers.filter((p) => p.status === s).length;
    const row = body.createEl('div', { cls: 'od-stat-row' });
    const mk = (num, label, accent) => {
      const d = row.createEl('div', { cls: `od-stat${accent ? ' od-stat--accent' : ''}` });
      d.createEl('div', { cls: 'od-stat-num', text: String(num) });
      d.createEl('div', { cls: 'od-stat-label', text: label });
    };
    mk(papers.length, '总计', true);
    mk(by('待读'), '待读'); mk(by('阅读中'), '阅读中'); mk(by('已完成'), '已完成');
    const hint = body.createEl('div', { cls: 'od-hint od-clickable', text: `本周新增 ${this.plugin.papersAddedThisWeek()} 篇 · 点击查看文献库` });
    hint.onclick = () => this.goto('library');
    return body;
  }

  buildFocusBars(body) {
    const log = this.plugin.settings.pomoLog || {};
    let max = 0; const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = window.moment().subtract(i, 'days');
      const min = (log[d.format('YYYY-MM-DD')] || {}).minutes || 0;
      max = Math.max(max, min); days.push({ d, min });
    }
    const total = days.reduce((a, b) => a + b.min, 0);
    if (!max) { body.createEl('div', { cls: 'od-task-empty', text: '还没有专注记录，点番茄钟开始第一个 25 分钟' }); return body; }
    const bars = body.createEl('div', { cls: 'od-bars' });
    days.forEach(({ d, min }) => {
      const col = bars.createEl('div', { cls: 'od-bar-col' });
      const bar = col.createEl('div', { cls: 'od-bar' });
      bar.style.height = `${Math.max(4, (min / max) * 100)}%`;
      bar.title = `${d.format('M月D日')}：${min} 分钟`;
      col.createEl('div', { cls: 'od-bar-label', text: d.format('M/D') });
    });
    body.createEl('div', { cls: 'od-hint', text: `近 7 天累计专注 ${Math.round(total / 60 * 10) / 10} 小时` });
    return body;
  }

  buildTopics(body) {
    const papers = this.plugin.getPapers();
    const chips = body.createEl('div', { cls: 'od-chips' });
    this.plugin.settings.topics.forEach((t) => {
      const n = papers.filter((p) => p.topics.includes(t)).length;
      const chip = chips.createEl('span', { cls: 'od-chip' });
      chip.createSpan({ text: t });
      chip.createEl('b', { text: String(n) });
      chip.onclick = () => this.goto('library');
    });
    return chips;
  }

  async buildSurvey(body) {
    const sections = await this.plugin.getSurveyProgress();
    if (!sections.length) { body.createEl('div', { cls: 'od-task-empty', text: '大纲还没有任务项' }); return body; }
    const wrap = body.createEl('div', { cls: 'jrs-fill' });
    sections.slice(0, 8).forEach((sec) => {
      const item = wrap.createEl('div', { cls: 'od-progress-item od-clickable' });
      item.onclick = () => this.plugin.openSurveyNote();
      const top = item.createEl('div', { cls: 'od-progress-top' });
      top.createEl('span', { cls: 'od-progress-name', text: sec.name });
      top.createEl('span', { cls: 'od-progress-frac', text: `${sec.done}/${sec.total}` });
      item.createEl('div', { cls: 'od-progressbar' })
        .createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${(sec.done / sec.total) * 100}%`;
    });
    return wrap;
  }

  buildLaunch(body) {
    const grid = body.createEl('div', { cls: 'od-launch' });
    const items = [
      { icon: 'file-plus', label: '添加文献', fn: () => new AddPaperModal(this.plugin, () => this.render()).open() },
      { icon: 'import', label: '批量导入', fn: () => new ImportFolderModal(this.plugin, () => this.render()).open() },
      { icon: 'sparkles', label: 'AI 发现', fn: () => this.goto('discover') },
      { icon: 'table', label: '文献矩阵', fn: () => this.plugin.generateMatrix() },
      { icon: 'database', label: 'Bases', fn: () => this.plugin.generateBases() },
      { icon: 'sprout', label: 'AI 综述', fn: () => new AiSynthesisModal(this.plugin).open() },
      { icon: 'target', label: '投稿冲刺', fn: () => this.goto('submit') },
      { icon: 'bot', label: '知识问答', fn: () => this.goto('ask') },
      { icon: 'inbox', label: '快速记想法', fn: () => new CaptureModal(this.plugin).open() },
      { icon: 'calendar-check', label: '今日小结', fn: () => this.plugin.generateDailyDigest() },
      { icon: 'panel-right', label: '侧栏工具', fn: () => this.plugin.activateSidePanel() },
      { icon: 'pen-line', label: '综述大纲', fn: () => this.plugin.ensureSurveyNote(true) },
      { icon: 'library', label: '文献库', fn: () => this.goto('library') },
      { icon: 'search', label: '全局搜索', fn: () => this.app.commands.executeCommandById('global-search:open') },
      { icon: 'calendar-days', label: '今日日记', fn: () => this.plugin.openDailyNote() },
    ];
    items.forEach((it) => {
      const b = grid.createEl('button', { cls: 'od-launch-item' });
      setIcon(b.createSpan(), it.icon);
      b.createSpan({ text: it.label });
      b.onclick = it.fn;
    });
    return grid;
  }

  buildRecent(body) {
    const papers = this.plugin.getPapersSorted('added').slice(0, 6);
    if (!papers.length) { body.createEl('div', { cls: 'od-task-empty', text: '文献库还是空的' }); return body; }
    const wrap = body.createEl('div', { cls: 'jrs-fill' });
    papers.forEach((p) => {
      const item = wrap.createEl('div', { cls: 'od-progress-item od-clickable' });
      item.onclick = () => this.plugin.openReading(p);
      const top = item.createEl('div', { cls: 'od-progress-top' });
      top.createEl('span', { cls: 'od-progress-name', text: p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title });
      const st = top.createEl('span', { cls: 'od-status' });
      st.setAttribute('data-status', p.status);
      st.textContent = p.status;
    });
    return wrap;
  }

  async buildCustom(body, id) {
    const def = this.plugin.settings.customCards.find((c) => `c:${c.uid}` === id);
    if (!def) return null;
    const cfg = def.cfg || {};
    if (def.type === 'note') {
      const f = this.app.vault.getAbstractFileByPath(normalizePath(cfg.path || ''));
      if (!(f instanceof TFile)) { body.createEl('div', { cls: 'od-task-empty', text: `笔记不存在：${cfg.path || '未配置'}` }); return body; }
      const content = await this.app.vault.cachedRead(f);
      const host = body.createEl('div', { cls: 'jrs-note-embed jrs-fill' });
      await MarkdownRenderer.render(this.app, content, host, f.path, this);
      return host;
    }
    if (def.type === 'countdown') {
      const target = window.moment(cfg.date, 'YYYY-MM-DD');
      if (!target.isValid()) { body.createEl('div', { cls: 'od-task-empty', text: '未配置日期' }); return body; }
      const days = target.diff(window.moment().startOf('day'), 'days');
      const num = body.createEl('div', { cls: 'jrs-count-num', text: String(Math.abs(days)) });
      num.toggleClass('is-urgent', days >= 0 && days <= 7);
      body.createEl('div', { cls: 'od-hint', text: days >= 0 ? `${cfg.label || '倒计时'}还有 ${days} 天` : `${cfg.label || '节点'}已过 ${-days} 天` });
      return body;
    }
    if (def.type === 'web') {
      const frame = body.createEl('iframe', { cls: 'jrs-web-frame jrs-fill' });
      frame.setAttribute('src', cfg.url || 'about:blank');
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups');
      return frame;
    }
    if (def.type === 'commands') {
      const ids = String(cfg.ids || '').split(/[,，;；\n]/).map((x) => x.trim()).filter(Boolean);
      const labels = String(cfg.labels || '').split(/[,，;；\n]/).map((x) => x.trim());
      const grid = body.createEl('div', { cls: 'od-launch' });
      ids.forEach((cid, i) => {
        const b = grid.createEl('button', { cls: 'od-launch-item' });
        setIcon(b.createSpan(), 'play');
        b.createSpan({ text: labels[i] || cid.split(':').pop() });
        b.onclick = () => this.app.commands.executeCommandById(cid);
      });
      return grid;
    }
    return null;
  }

  /* ========== 区段：AI 发现 ========== */

  renderDiscover(page) {
    if (!this._discoverSrc) this._discoverSrc = 'arxiv';
    const intro = page.createEl('section', { cls: 'jrs-card' });
    const head = intro.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '论文检索' });
    head.createSpan({ text: 'arXiv 预印本 + Crossref 正式期刊（自动标注中科院分区，参考值）' });
    /* 源切换 */
    const srcRow = intro.createEl('div', { cls: 'od-filters' });
    const mkSrc = (id, label) => {
      const c = srcRow.createEl('button', { cls: `od-filter${this._discoverSrc === id ? ' is-active' : ''}`, text: label });
      c.onclick = () => { this._discoverSrc = id; this.render(); };
      return c;
    };
    mkSrc('arxiv', 'arXiv 预印本');
    mkSrc('crossref', 'Crossref 期刊');
    const form = intro.createEl('div', { cls: 'jrs-discover-form' });
    const input = form.createEl('input', {
      type: 'text',
      placeholder: this._discoverSrc === 'arxiv'
        ? '如 all:"satellite scheduling" OR all:"earth observation"'
        : '如 satellite scheduling grid / 敏捷卫星 调度（英文效果最佳）',
    });
    if (this._discoverSrc === 'arxiv') input.value = this.plugin.settings.arxivQuery;
    const num = form.createEl('input', { type: 'number', attr: { min: '3', max: '20' } });
    num.value = String(this.plugin.settings.arxivMax);
    const btn = form.createEl('button', { cls: 'od-btn od-btn--primary', text: '检索' });
    const host = page.createEl('div', { cls: 'jrs-discover-results' });
    const renderResults = (items) => {
      host.empty();
      if (!items || !items.length) { host.createEl('div', { cls: 'od-task-empty', text: '没有结果，换个关键词试试' }); return; }
      items.forEach((it) => {
        const card = host.createEl('article', { cls: 'jrs-card jrs-paper-row' });
        const main = card.createEl('div', { cls: 'jrs-row-main' });
        const t = main.createEl('div', { cls: 'jrs-row-title', text: it.title });
        if (it.url) t.onclick = () => window.open(it.url);
        const metaLine = main.createEl('div', { cls: 'od-hint' });
        const zone = this.plugin.zoneOf(it.venue);
        metaLine.textContent = [it.date, it.venue, it.authors].filter(Boolean).join(' · ');
        if (zone) { const zb = this.plugin.zoneBadge(zone); if (zb) main.appendChild(zb); }
        if (it.summary) main.createEl('div', { cls: 'jrs-row-summary', text: it.summary.slice(0, 160) + '…' });
        const acts = card.createEl('div', { cls: 'jrs-row-actions' });
        const add = acts.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '＋ 入库' });
        add.onclick = async () => {
          add.disabled = true;
          try {
            if (it.source === 'crossref') await this.plugin.crossrefToLibrary(it);
            else await this.plugin.arxivToLibrary(it);
            new Notice('已加入文献库 ');
            add.textContent = '已入库';
          } catch (e) { new Notice(`入库失败：${e.message}`); add.disabled = false; }
        };
      });
    };
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = '检索中…';
      try {
        const q = input.value.trim();
        const n = Math.min(20, Math.max(3, parseInt(num.value, 10) || 8));
        if (this._discoverSrc === 'arxiv') {
          if (q) { this.plugin.settings.arxivQuery = q; await this.plugin.saveSettings(); }
          this.plugin.settings.arxivMax = n;
          const r = await this.plugin.fetchArxiv(true);
          renderResults(r.items.slice(0, n));
        } else {
          const items = await this.plugin.searchCrossref(q, n);
          renderResults(items);
        }
      } catch (e) { new Notice(`检索失败：${e.message}`); }
      btn.disabled = false;
      btn.textContent = '检索';
    };
    if (this._discoverSrc === 'arxiv') {
      const cache = this.plugin.settings.arxivCache;
      if (cache?.items?.length) renderResults(cache.items.slice(0, this.plugin.settings.arxivMax));
      else host.createEl('div', { cls: 'od-task-empty', text: '输入关键词点「检索」' });
    } else {
      host.createEl('div', { cls: 'od-task-empty', text: '输入英文关键词检索正式期刊论文（EJOR/AST 等），结果自动标注分区' });
    }
  }

  /* ========== 区段：阅读队列 ========== */

  renderQueue(page) {
    const papers = this.plugin.getPapers();
    const groups = [
      { title: '进行中', hint: '正在阅读的文献', items: papers.filter((p) => p.status === '阅读中') },
      { title: '高优先待读', hint: '先啃硬骨头', items: papers.filter((p) => p.priority === '高' && p.status === '待读') },
      { title: '排队待读', hint: '按优先级与时间排序', items: papers.filter((p) => p.status === '待读' && p.priority !== '高').sort((a, b) => (PRIORITIES.indexOf(a.priority || '低') - PRIORITIES.indexOf(b.priority || '低')) || b.added - a.added).slice(0, 15) },
    ];
    groups.forEach((g) => {
      const panel = page.createEl('section', { cls: 'jrs-card' });
      const head = panel.createEl('div', { cls: 'jrs-section-heading' });
      head.createEl('h2', { text: g.title });
      head.createSpan({ text: g.hint });
      if (!g.items.length) { panel.createEl('div', { cls: 'od-task-empty', text: '暂无' }); return; }
      g.items.forEach((p) => panel.appendChild(this.paperRow(p)));
    });
  }

  paperRow(p) {
    const row = document.createElement('article');
    row.className = 'jrs-paper-row';
    const main = row.createEl('div', { cls: 'jrs-row-main' });
    const title = main.createEl('div', { cls: 'jrs-row-title', text: p.title });
    title.onclick = () => this.plugin.openReading(p);
    const meta = main.createEl('div', { cls: 'od-hint' });
    const zone = this.plugin.zoneOf(p.venue);
    meta.textContent = [p.year, p.venue, p.authorsShort].filter(Boolean).join(' · ') || '—';
    if (zone) { const zb = this.plugin.zoneBadge(zone); if (zb) main.appendChild(zb); }
    /* 进度条 + 快进按钮 */
    const prog = main.createEl('div', { cls: 'jrs-progress' });
    const bar = prog.createEl('div', { cls: 'od-progressbar' });
    bar.createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${p.progress}%`;
    const pct = prog.createEl('button', { cls: 'jrs-progress-pct', text: `${p.progress}%`, title: '点击 +25% 阅读进度' });
    pct.onclick = async () => { await this.plugin.bumpProgress(p, 25); this.render(); };
    const acts = row.createEl('div', { cls: 'jrs-row-actions' });
    const st = acts.createEl('span', { cls: 'od-status' });
    st.setAttribute('data-status', p.status);
    st.textContent = p.status;
    st.onclick = async () => {
      const next = STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
      await this.plugin.setPaperStatus(p, next);
      this.render();
    };
    const read = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: '分栏阅读' });
    read.onclick = () => this.plugin.openReading(p);
    return row;
  }

  /* ========== 区段：文献库（嵌入面板） ========== */

  renderLibrarySection(page) {
    if (!this._panel) this._panel = new LibraryPanel(this.plugin, () => this.render());
    this._panel.host = page;
    this._panel.render();
  }

  /* ========== 区段：论文图谱 ========== */

  async renderGraph(page) {
    const stats = this.plugin.graphStats();
    const intro = page.createEl('section', { cls: 'jrs-card' });
    const head = intro.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '论文图谱' });
    head.createSpan({ text: `主题 ${stats.topics} 个 · 论文 ${stats.papers} 篇 · 连线 ${stats.edges} 条` });
    const desc = intro.createEl('div', { cls: 'od-hint' });
    desc.textContent = '生成 Obsidian Canvas：主题节点居中、论文节点按方向环绕，连线表示归属关系。可在画布中自由拖拽编辑。';
    const acts = intro.createEl('div', { cls: 'jrs-row-actions' });
    const exists = !!this.app.vault.getAbstractFileByPath(this.plugin.settings.graphCanvas);
    /* 真实图谱缩略预览：读 canvas JSON → SVG */
    if (exists) {
      const thumb = intro.createEl('div', { cls: 'jrs-graph-thumb' });
      try {
        const f = this.app.vault.getAbstractFileByPath(this.plugin.settings.graphCanvas);
        const data = JSON.parse(await this.app.vault.cachedRead(f));
        const nodes = data.nodes || [];
        const edges = data.edges || [];
        const okNodes = nodes.filter((nd) => Number.isFinite(nd.x) && Number.isFinite(nd.y));
        if (okNodes.length) {
          const xs = okNodes.map((nd) => nd.x); const ys = okNodes.map((nd) => nd.y);
          const minX = Math.min(...xs) - 160; const maxX = Math.max(...xs) + 160;
          const minY = Math.min(...ys) - 60; const maxY = Math.max(...ys) + 60;
          const W = 640; const H = Math.max(200, Math.round((W * (maxY - minY)) / (maxX - minX)));
          const sx = (x) => ((x - minX) / (maxX - minX)) * W;
          const sy = (y) => ((y - minY) / (maxY - minY)) * H;
          const nodeById = Object.fromEntries(nodes.map((nd) => [nd.id, nd]));
          let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`;
          edges.forEach((e) => {
            const a = nodeById[e.fromNode]; const b = nodeById[e.toNode];
            if (!a || !b) return;
            svg += `<line x1="${sx(a.x + 130)}" y1="${sy(a.y + 30)}" x2="${sx(b.x + 140)}" y2="${sy(b.y + 40)}" stroke="rgba(124,140,180,.28)" stroke-width="1"/>`;
          });
          nodes.forEach((nd) => {
            const isTopic = String(nd.id).startsWith('topic-');
            const cx = sx(nd.x + (nd.width || 260) / 2); const cy = sy(nd.y + (nd.height || 60) / 2);
            if (isTopic) {
              svg += `<rect x="${sx(nd.x)}" y="${sy(nd.y)}" width="${Math.max(40, (nd.width || 260) / (maxX - minX) * W)}" height="${Math.max(16, (nd.height || 60) / (maxY - minY) * H)}" rx="6" fill="rgba(76,125,239,.85)"/>`;
            } else {
              svg += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="rgba(120,140,180,.9)"/>`;
            }
          });
          svg += '</svg>';
          thumb.innerHTML = svg;
          const cap = intro.createEl('div', { cls: 'od-hint' });
          cap.textContent = `缩略预览：${okNodes.filter((nd) => String(nd.id).startsWith('topic-')).length} 主题节点 · ${okNodes.length} 节点 · ${edges.length} 连线（打开图谱可拖拽编辑）`;
        }
      } catch (e) {
        thumb.createEl('div', { cls: 'od-hint', text: `图谱文件解析失败：${e.message}` });
      }
    }
    if (exists) {
      const open = acts.createEl('button', { cls: 'od-btn od-btn--primary', text: '打开图谱' });
      open.onclick = () => this.plugin.openGraphCanvas();
      const gen = acts.createEl('button', { cls: 'od-btn', text: '重建图谱' });
      gen.title = '按当前文献库重建（顶部「重建图谱」同效）';
      gen.onclick = async () => { await this.plugin.generateGraphCanvas(true); this.render(); };
    } else {
      const gen = acts.createEl('button', { cls: 'od-btn od-btn--primary', text: '生成图谱' });
      gen.onclick = async () => { await this.plugin.generateGraphCanvas(true); this.render(); };
    }
    /* 主题统计卡 */
    const grid = page.createEl('div', { cls: 'jrs-topic-grid' });
    const papers = this.plugin.getPapers();
    this.plugin.settings.topics.forEach((t) => {
      const items = papers.filter((p) => p.topics.includes(t));
      const card = grid.createEl('div', { cls: 'jrs-card jrs-topic-card' });
      card.createEl('div', { cls: 'jrs-topic-name', text: t });
      card.createEl('div', { cls: 'jrs-topic-count', text: `${items.length} 篇` });
      items.slice(0, 3).forEach((p) => {
        const line = card.createEl('div', { cls: 'od-hint' });
        line.textContent = '· ' + (p.title.length > 28 ? p.title.slice(0, 28) + '…' : p.title);
        if (p.authorsShort) {
          const au = line.createEl('span', { cls: 'jrs-graph-author' });
          au.textContent = ' — ' + p.authorsShort;
        }
      });
      if (!items.length) card.createEl('div', { cls: 'od-hint', text: '暂无论文' });
    });
  }

  /* ========== 区段：研究进展 ========== */

  async renderProgress(page) {
    /* 综述大纲 */
    const surveyCard = page.createEl('section', { cls: 'jrs-card' });
    let head = surveyCard.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '综述大纲' });
    head.createSpan({ text: this.plugin.surveyExists() ? '按章节跟踪写作进度' : '尚未初始化' });
    if (!this.plugin.surveyExists()) {
      const init = surveyCard.createEl('button', { cls: 'od-btn od-btn--primary', text: '初始化综述大纲' });
      init.onclick = () => this.plugin.ensureSurveyNote(true);
    } else {
      const sections = await this.plugin.getSurveyProgress();
      const all = sections.reduce((a, s) => ({ d: a.d + s.done, t: a.t + s.total }), { d: 0, t: 0 });
      if (all.d === 0) {
        const cta = surveyCard.createEl('div', { cls: 'jrs-zero-cta' });
        cta.createSpan({ text: '还没有任何勾选——打开大纲勾掉第一项，或点任意章节的起草按钮直接让 AI 生成初稿' });
      }
      const total = surveyCard.createEl('div', { cls: 'jrs-progress' });
      total.createEl('div', { cls: 'od-progressbar' }).createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${all.t ? (all.d / all.t) * 100 : 0}%`;
      total.createEl('span', { cls: 'od-hint', text: `总体 ${all.d}/${all.t}` });
      sections.forEach((sec) => {
        const item = surveyCard.createEl('div', { cls: 'od-progress-item' });
        const top = item.createEl('div', { cls: 'od-progress-top' });
        const nameEl = top.createEl('span', { cls: 'od-progress-name od-clickable', text: sec.name });
        nameEl.onclick = () => this.plugin.openSurveyNote();
        const right = top.createEl('span', { cls: 'od-progress-tools' });
        right.createEl('span', { cls: 'od-progress-frac', text: `${sec.done}/${sec.total}` });
        const draft = right.createEl('button', { cls: 'od-icon-btn', title: 'AI 起草本章（基于文献库，带来源）' });
        setIcon(draft, 'sparkles');
        draft.onclick = async () => {
          draft.disabled = true;
          new Notice(`正在为「${sec.name}」起草初稿…`);
          try {
            await this.plugin.aiDraftSection(sec.name);
            new Notice(`「${sec.name}」初稿已写入大纲 sparkles`);
            this.render();
          } catch (e) {
            new Notice(`起草失败：${e.message}`);
            draft.disabled = false;
          }
        };
        const bar = item.createEl('div', { cls: 'od-progressbar' });
        bar.createEl('div', { cls: 'od-progressbar-fill' }).style.width = `${(sec.done / sec.total) * 100}%`;
      });
      const acts = surveyCard.createEl('div', { cls: 'jrs-row-actions' });
      [['pen-line', '打开大纲', () => this.plugin.openSurveyNote()],
        ['sprout', 'AI 综述', () => new AiSynthesisModal(this.plugin).open()],
        ['table', '文献矩阵', () => this.plugin.generateMatrix()],
        ['database', 'Bases', () => this.plugin.generateBases()]].forEach(([icon, label, fn]) => {
        const b = acts.createEl('button', { cls: 'od-btn od-btn--sm' });
        setIcon(b.createSpan(), icon);
        b.createSpan({ text: label });
        b.onclick = fn;
      });
    }

    /* 研究问题 */
    const qCard = page.createEl('section', { cls: 'jrs-card' });
    head = qCard.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '研究问题' });
    head.createSpan({ text: '把疑问沉淀成问题清单，逐个击破' });
    const qAdd = qCard.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '＋ 新问题' });
    const questions = await this.plugin.getQuestions();
    qAdd.onclick = () => new AddQuestionModal(this.plugin, () => this.render()).open();
    const qList = qCard.createEl('div', { cls: 'jrs-fill' });
    if (!questions.length) qList.createEl('div', { cls: 'od-task-empty', text: '还没有研究问题，读文献时冒出的疑问记到这里' });
    questions.forEach((q) => {
      const item = qList.createEl('div', { cls: 'jrs-question-item' });
      const main = item.createEl('div', { cls: 'jrs-row-main' });
      const t = main.createEl('div', { cls: 'jrs-row-title', text: q.question });
      t.onclick = () => this.plugin.smartOpenFile(q.file);
      main.createEl('div', { cls: 'od-hint', text: `${q.status === 'answered' ? '已解答' : ' 待解答'} · ${window.moment(q.added).format('M月D日')}` });
      const st = item.createEl('button', { cls: `od-btn od-btn--sm${q.status === 'answered' ? '' : ' od-btn--primary'}` });
      st.textContent = q.status === 'answered' ? '重新打开' : '标记已解答';
      st.onclick = async () => { await this.plugin.toggleQuestion(q); this.render(); };
    });
  }

  /* ========== 区段：投稿冲刺 ========== */

  async renderSubmit(page) {
    /* ── 期刊速查器（任意期刊 → CCF/科协/中科院2025/新锐2026/预警）── */
    const qc = page.createEl('section', { cls: 'jrs-card' });
    const qh = qc.createEl('div', { cls: 'jrs-section-heading' });
    qh.createEl('h2', { text: '期刊速查器' });
    const cacheNow = this.plugin._jcache;
    qh.createSpan({ text: cacheNow ? `已加载全量库（中科院2025 ${Object.keys(cacheNow.cas || {}).length} 刊 · 新锐2026 ${Object.keys(cacheNow.xr || {}).length} 刊）` : '内置 CCF2026·科协目录；下载全量库后可查任意期刊的 2025 中科院分区与新锐分区' });
    const dlBtn = qh.createEl('button', { cls: 'od-btn od-btn--sm' });
    setIcon(dlBtn.createSpan(), 'download');
    dlBtn.createSpan({ text: cacheNow ? '更新全量库' : '下载全量库(约10MB)' });
    dlBtn.onclick = async () => {
      dlBtn.disabled = true;
      new Notice('正在下载并解析中科院2025 + 新锐2026…');
      try {
        const r = await this.plugin.downloadJournalDB();
        new Notice(`期刊库就绪：中科院 ${r.cas} 刊 · 新锐 ${r.xr} 刊`);
        this.render();
      } catch (e) { new Notice(`下载失败：${e.message}`); dlBtn.disabled = false; }
    };
    const qRow = qc.createEl('div', { cls: 'jrs-discover-form' });
    const qInput = qRow.createEl('input', { type: 'text', placeholder: '输入任意期刊/会议名，如 Journal of Scheduling、GECCO、宇航学报…' });
    const qOut = qc.createEl('div', { cls: 'jrs-lookup-out' });
    let deb = null;
    const badge = (text, cls, title) => {
      const b = document.createElement('span');
      b.className = 'jrs-zone-badge';
      b.textContent = text;
      b.setAttribute('data-zone', cls);
      if (title) b.title = title;
      return b;
    };
    const runQ = async () => {
      const v = qInput.value.trim();
      qOut.empty();
      if (!v) return;
      const r = await this.plugin.lookupJournal(v);
      if (!r.found) {
        qOut.createEl('div', { cls: 'od-hint', text: `未收录「${v}」——内置库含 CCF2026/科协目录${this.plugin._jcache ? '' : '；点右上下载全量库可查中科院2025/新锐2026'}。试试全称或缩写？` });
        return;
      }
      const row = qOut.createEl('div', { cls: 'jrs-lookup-result' });
      row.createEl('span', { cls: 'jrs-lookup-name', text: v });
      const badges = row.createEl('span', { cls: 'jrs-ask-sources' });
      if (r.cas) badges.appendChild(badge(`中科院 ${r.cas}${r.casTop ? ' · Top' : ''}`, r.cas.includes('1区') ? 'top' : 'mid', r.cat ? `大类：${r.cat}` : ''));
      if (r.xr) badges.appendChild(badge(`新锐 ${r.xr}`, 'cn', '中科院2026新锐期刊分区'));
      if (r.ccf) badges.appendChild(badge(`CCF-${r.ccf.grade}`, 'top', `${r.ccf.type}${r.ccf.field ? ' · ' + r.ccf.field : ''}`));
      if (r.cast) badges.appendChild(badge(`科协 ${r.cast}`, r.cast.startsWith('T1') || r.cast === 'A' ? 'top' : 'mid', r.castField ? `中国科协高质量目录 · ${r.castField}` : '中国科协高质量目录'));
      if (r.jcr) badges.appendChild(badge(`JCR ${r.jcr}`, 'mid'));
      if (r.target) badges.appendChild(badge('目标刊', 'cn', '已在投稿冲刺目标期刊库'));
      if (r.warn) badges.appendChild(badge(`预警：${r.warn}`, 'top', '2025 国际期刊预警名单'));
    };
    qInput.oninput = () => { if (deb) clearTimeout(deb); deb = setTimeout(runQ, 250); };
    qInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (deb) clearTimeout(deb); runQ(); } };
    this.plugin.loadJournalCache(true).then(() => { if (this.plugin._jcache && qInput.value) runQ(); });

    /* 我的投稿管线 */
    const pipe = page.createEl('section', { cls: 'jrs-card' });
    let head = pipe.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '我的投稿管线' });
    head.createSpan({ text: '状态流：写作中 → 已投 → 审稿 → 修回 → 接收/改投' });
    const addBtn = pipe.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '＋ 新建投稿' });
    addBtn.onclick = () => new AddSubmissionModal(this.plugin, () => this.render()).open();

    const subs = this.plugin.getSubmissions();
    if (!subs.length) {
      pipe.createEl('div', { cls: 'od-task-empty', text: '还没有投稿条目，从综述大纲或新 idea 建一条，盯住它到接收' });
    }
    const stages = [['写作中', '准备投稿'], ['已投', '审稿中'], ['大修', '小修'], ['已接收'], ['已拒稿', '改投']];
    stages.forEach((stage) => {
      const items = subs.filter((s) => stage.includes(s.status));
      if (!items.length) return;
      const g = pipe.createEl('div', { cls: 'jrs-submit-group' });
      g.createEl('div', { cls: 'jrs-submit-stage', text: stage.join(' / ') });
      items.forEach((s) => {
        const row = g.createEl('div', { cls: 'jrs-paper-row jrs-submit-row' });
        const main = row.createEl('div', { cls: 'jrs-row-main' });
        const t = main.createEl('div', { cls: 'jrs-row-title', text: `${s.title} → ${s.target}` });
        t.onclick = () => this.plugin.smartOpenFile(s.file);
        const hint = main.createEl('div', { cls: 'od-hint' });
        let meta = `${s.status} · ${window.moment(s.added).format('M月D日')} 起`;
        if (s.deadline) {
          const md = window.moment(s.deadline, 'YYYY-MM-DD');
          if (!md.isValid()) { meta += ' · 截稿日期无效'; }
          else {
            const d = md.diff(window.moment().startOf('day'), 'days');
            meta += d >= 0 ? ` · 截稿还剩 ${d} 天` : ` · 截稿已过 ${-d} 天`;
          }
        }
        hint.textContent = meta;
        const acts = row.createEl('div', { cls: 'jrs-row-actions' });
        const st = acts.createEl('span', { cls: 'od-status jrs-sub-status', attr: { 'data-sub': s.status } });
        st.textContent = s.status;
        st.title = '点击流转到下一状态';
        st.onclick = async () => { await this.plugin.cycleSubmission(s); this.render(); };
        const open = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: '打开' });
        open.onclick = () => this.plugin.smartOpenFile(s.file);
      });
    });

    /* 今日收件箱（快速捕获的闭环出口） */
    const inboxItems = await this.plugin.getInboxToday();
    if (inboxItems.length) {
      const ib = page.createEl('section', { cls: 'jrs-card' });
      const ibh = ib.createEl('div', { cls: 'jrs-section-heading' });
      ibh.createEl('h2', { text: '今日收件箱' });
      ibh.createSpan({ text: `${inboxItems.length} 条想法待处理` });
      const openIb = ibh.createEl('button', { cls: 'od-btn od-btn--sm', text: '打开' });
      openIb.onclick = () => this.plugin.openInboxNote();
      inboxItems.slice(0, 5).forEach((txt) => {
        ib.createEl('div', { cls: 'od-hint', text: '· ' + txt.slice(0, 60) });
      });
    }

    /* 目标期刊速查 */
    const jcard = page.createEl('section', { cls: 'jrs-card' });
    head = jcard.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '目标期刊速查' });
    head.createSpan({ text: 'EJOR 等运算顶刊与航天核心刊 · 分区以中科院最新版为准' });
    const grid = jcard.createEl('div', { cls: 'jrs-journal-grid' });
    JOURNALS.forEach((j) => {
      const c = grid.createEl('div', { cls: 'jrs-journal' });
      const top = c.createEl('div', { cls: 'jrs-journal-top' });
      const ab = top.createEl('span', { cls: 'jrs-journal-abbr', text: j.abbr });
      ab.setAttribute('title', j.name);
      const tag = top.createEl('span', { cls: 'jrs-journal-tag', text: j.tag });
      tag.setAttribute('data-tag', j.tag.includes('顶刊') ? 'top' : j.tag.includes('EI') ? 'cn' : 'mid');
      if (j.cas) {
        const z = top.createEl('span', { cls: 'jrs-journal-tag jrs-journal-zone', text: `中科院 ${j.cas}${j.jcr ? ' · ' + j.jcr : ''}` });
        z.setAttribute('data-tag', j.cas.includes('1区') ? 'top' : j.cas.includes('EI') ? 'cn' : 'mid');
      }
      c.createEl('div', { cls: 'jrs-journal-name', text: j.name });
      const match = c.createEl('div', { cls: 'jrs-journal-match' });
      match.textContent = `方向匹配：${j.match}`;
      c.createEl('div', { cls: 'od-hint', text: `${j.publisher} · ${j.field}` });
      if (j.note) c.createEl('div', { cls: 'jrs-journal-note', text: j.note });
      if (j.link) {
        const a = c.createEl('a', { cls: 'jrs-journal-link', text: '投稿入口 ↗' });
        a.href = j.link;
        a.target = '_blank';
      }
    });
  }

  /* ========== 区段：知识问答（ima 哲学：你的知识库即 AI 大脑） ========== */

  async renderAsk(page) {
    const card = page.createEl('section', { cls: 'jrs-card jrs-ask' });
    const head = card.createEl('div', { cls: 'jrs-section-heading' });
    head.createEl('h2', { text: '问你的文献库' });
    head.createSpan({ text: '问答自动存档到 科研工作台/AI问答/，重开不丢' });

    const inputRow = card.createEl('div', { cls: 'jrs-ask-input' });
    const input = inputRow.createEl('input', { type: 'text', placeholder: '如：网格热力图如何驱动多星调度决策？EJOR 论文常用的基线算法有哪些？' });
    const btn = inputRow.createEl('button', { cls: 'od-btn od-btn--primary', text: '提问' });
    const busy = card.createEl('div', { cls: 'od-hint' });

    const list = page.createEl('div', { cls: 'jrs-ask-list' });

    const paperByBasename = (name) => this.plugin.getPapers().find((pp) => pp.file.basename === name);

    const renderAnswer = (item) => {
      const block = list.createEl('div', { cls: 'jrs-ask-item od-anim' });
      const q = block.createEl('div', { cls: 'jrs-ask-q' });
      setIcon(q.createSpan(), 'help-circle');
      q.createSpan({ text: item.q });
      const a = block.createEl('div', { cls: 'jrs-ask-a' });
      MarkdownRenderer.render(this.app, item.a, a, '/', this);
      if (item.sources?.length) {
        const src = block.createEl('div', { cls: 'jrs-ask-sources' });
        src.createSpan({ cls: 'jrs-ask-sources-label', text: '来源' });
        item.sources.forEach((s) => {
          const chip = src.createEl('span', { cls: 'od-chip' });
          const paper = s.file ? s : paperByBasename(s.basename || s.title);
          const label = (paper ? paper.title : (s.title || s.basename || '') || '');
          chip.textContent = label.length > 26 ? label.slice(0, 26) + '…' : label;
          if (paper) chip.onclick = () => this.plugin.openPaper(paper);
          else chip.style.opacity = '0.6';
        });
      }
      const acts = block.createEl('div', { cls: 'jrs-row-actions' });
      const save = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: '沉淀为研究问题' });
      save.onclick = async () => {
        const names = item.sources.map((s) => (s.file ? s.file.basename : s.basename)).filter(Boolean);
        await this.plugin.createQuestion(item.q, names.join(','));
        await this.plugin.appendAnswerToQuestion(item.q, item.a);
        new Notice('已沉淀到研究问题 ');
      };
    };

    const refreshList = async () => {
      const items = await this.plugin.getAskLogToday();
      list.empty();
      if (!items.length) {
        list.createEl('div', { cls: 'od-task-empty', text: this.plugin.settings.ai.apiKey ? '问一个你综述里的问题试试，回答会标注引用来源' : '先在 设置 → AI 助手 配置 API Key（DeepSeek 等），即可向自己的文献库提问' });
        return;
      }
      items.slice(0, 8).forEach(renderAnswer);
    };

    let asking = false;
    const ask = async () => {
      if (asking) return;
      const q = input.value.trim();
      if (!q) {
        new Notice('请输入问题，例如：网格热力图如何驱动多星调度决策？');
        input.focus();
        return;
      }
      asking = true;
      btn.disabled = true;
      busy.textContent = '正在检索文献库并生成回答…';
      try {
        const item = await this.plugin.aiAsk(q);
        await this.plugin.appendAskLog(item);
        input.value = '';
        busy.textContent = '';
        await refreshList();
      } catch (e) {
        busy.textContent = `${e.message}`;
        new Notice(`问答失败：${e.message}`);
      }
      asking = false;
      btn.disabled = false;
    };
    btn.onclick = ask;
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ask(); } };

    /* 空态：示例问题 chips（点击即填入提问） */
    const _hist = await this.plugin.getAskLogToday();
    const _hasHistory = _hist.length > 0;
    if (!_hasHistory) {
      const sug = card.createEl('div', { cls: 'jrs-ask-suggest' });
      sug.createEl('div', { cls: 'od-hint', text: '试试这些问题：' });
      const chips = sug.createEl('div', { cls: 'od-chips' });
      ['网格热力图如何驱动多星调度决策？', '元启发式算法在卫星调度中怎么用？', '敏捷卫星与常规成像卫星的调度差异？'].forEach((q) => {
        const c = chips.createEl('span', { cls: 'od-chip', text: q });
        c.onclick = () => { input.value = q; input.focus(); };
      });
    }
    await refreshList();
  }

  /* ========== 区段：阅读笔记 ========== */

  renderReader(page) {
    const papers = this.plugin.getPapers().filter((p) => p.status === '阅读中' || p.status === '待读');
    const intro = page.createEl('section', { cls: 'jrs-card' });
    const head = intro.createEl('div', { cls: 'jrs-section-heading' });
    if (!papers.length) {
      head.createEl('h2', { text: '选择一篇论文开始精读' });
      intro.createEl('div', { cls: 'od-task-empty', text: '文献库为空或都已读完，去「AI 发现」找新论文' });
      return;
    }
    head.createEl('h2', { text: '继续精读' });
    head.createSpan({ text: `进行中 ${papers.filter((p) => p.status === '阅读中').length} 篇 · 共 ${papers.length} 篇可选` });
    papers.slice(0, 30).forEach((p) => {
      const row = page.createEl('article', { cls: 'jrs-card jrs-paper-row' });
      const main = row.createEl('div', { cls: 'jrs-row-main' });
      const t = main.createEl('div', { cls: 'jrs-row-title', text: p.title });
      t.onclick = () => this.plugin.openReading(p);
      const meta = main.createEl('div', { cls: 'od-hint' });
      const zone = this.plugin.zoneOf(p.venue);
      meta.textContent = `${p.status}${zone ? ' · ' + zone.abbr + ' ' + zone.cas : ''}${p.priority ? ' · 优先级 ' + p.priority : ''}${p.year ? ' · ' + p.year : ''} · 进度 ${p.progress}%`;
      const acts = row.createEl('div', { cls: 'jrs-row-actions' });
      const read = acts.createEl('button', { cls: 'od-btn od-btn--primary od-btn--sm', text: '分栏阅读' });
      read.onclick = () => this.plugin.openReading(p);
      const ai = acts.createEl('button', { cls: 'od-btn od-btn--sm', text: 'AI' });
      setIcon(ai.createSpan(), 'sparkles');
      ai.onclick = () => new AiPaperModal(this.plugin, p, () => this.render()).open();
    });
  }
}

/* ==========================================================================
 * 文献库面板（可嵌入区段，也可挂独立视图）
 * ========================================================================== */

class LibraryPanel {
  constructor(plugin, rerender) {
    this.plugin = plugin;
    this.rerender = rerender || (() => {});
    this.q = ''; this.statusFilter = '全部'; this.prioFilter = '全部';
    this.topicFilter = ''; this.sort = 'added';
  }

  applyIncomingTopic() {
    if (this.plugin.libFilterTopic) {
      this.topicFilter = this.plugin.libFilterTopic;
      this.plugin.libFilterTopic = '';
    }
  }

  render() {
    const root = this.host;
    root.empty();
    this.applyIncomingTopic();

    const bar = root.createEl('div', { cls: 'od-lib-toolbar' });
    const search = bar.createEl('div', { cls: 'od-search' });
    setIcon(search.createSpan(), 'search');
    const input = search.createEl('input', { type: 'text', placeholder: '搜索标题 / 作者 / 来源…' });
    input.value = this.q;
    input.oninput = () => { this.q = input.value; this.renderList(); };
    const sortSel = bar.createEl('select', { cls: 'od-btn' });
    [['added', '最近添加'], ['year', '年份'], ['title', '标题'], ['rating', '评分'], ['priority', '优先级']].forEach(([v, l]) => {
      sortSel.createEl('option', { value: v }).textContent = l;
    });
    sortSel.value = this.sort;
    sortSel.onchange = () => { this.sort = sortSel.value; this.renderList(); };
    const mkTool = (cls, icon, label, fn) => {
      const b = bar.createEl('button', { cls });
      setIcon(b.createSpan(), icon);
      b.createSpan({ text: label });
      b.onclick = fn;
    };
    mkTool('od-btn od-btn--primary', 'plus', '添加', () => new AddPaperModal(this.plugin, () => this.render()).open());
    mkTool('od-btn', 'import', '导入', () => new ImportFolderModal(this.plugin, () => this.render()).open());
    mkTool('od-btn', 'table', '矩阵', () => this.plugin.generateMatrix());
    mkTool('od-btn', 'database', 'Bases', () => this.plugin.generateBases());
    mkTool('od-btn', 'database', 'PDF 入库', () => this.plugin.migrateExternalPdfs().then(() => this.render()));

    const fRow = root.createEl('div', { cls: 'od-filters' });
    ['全部', ...STATUSES].forEach((s) => {
      const c = fRow.createEl('button', { cls: `od-filter${this.statusFilter === s ? ' is-active' : ''}`, text: s });
      c.onclick = () => { this.statusFilter = s; this.render(); };
    });
    const pRow = root.createEl('div', { cls: 'od-filters' });
    ['全部', ...PRIORITIES, '无'].forEach((p) => {
      const c = pRow.createEl('button', { cls: `od-filter${this.prioFilter === p ? ' is-active' : ''}`, text: p === '全部' ? '全部优先级' : p });
      c.onclick = () => { this.prioFilter = p; this.render(); };
    });
    const tRow = root.createEl('div', { cls: 'od-filters' });
    const all = tRow.createEl('button', { cls: `od-filter${this.topicFilter === '' ? ' is-active' : ''}`, text: '全部方向' });
    all.onclick = () => { this.topicFilter = ''; this.render(); };
    this.plugin.settings.topics.forEach((t) => {
      const c = tRow.createEl('button', { cls: `od-filter${this.topicFilter === t ? ' is-active' : ''}`, text: t });
      c.onclick = () => { this.topicFilter = this.topicFilter === t ? '' : t; this.render(); };
    });

    this._listHost = root.createEl('div');
    this.renderList();
  }

  filtered() {
    const q = this.q.trim().toLowerCase();
    return this.plugin.getPapersSorted(this.sort).filter((p) => {
      if (this.statusFilter !== '全部' && p.status !== this.statusFilter) return false;
      if (this.prioFilter === '无' && p.priority) return false;
      if (this.prioFilter !== '全部' && this.prioFilter !== '无' && p.priority !== this.prioFilter) return false;
      if (this.topicFilter && !p.topics.includes(this.topicFilter)) return false;
      if (q && !`${p.title} ${p.authors} ${p.venue}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  renderList() {
    if (!this._listHost) return;
    this._listHost.empty();
    const papers = this.filtered();
    const grid = this._listHost.createEl('div', { cls: 'od-papers' });
    if (!papers.length) {
      const e = grid.createEl('div', { cls: 'od-empty' });
      setIcon(e.createSpan(), 'book-open');
      e.createSpan({ text: '没有符合条件的文献' });
      return;
    }
    papers.forEach((p, i) => grid.appendChild(this.paperCard(p, i)));
  }

  paperCard(p, i) {
    const el = document.createElement('article');
    el.addClass('od-paper', 'od-anim');
    el.style.animationDelay = `${Math.min(i * 25, 300)}ms`;
    el.createEl('div', { cls: 'od-paper-title', text: p.title });
    const meta = el.createEl('div', { cls: 'od-paper-meta' });
    const zone = (p.fmCas || p.fmXr || p.fmCcf || p.fmTier) ? { cas: p.fmCas, top: p.fmCasTop, xr: p.fmXr, ccf: p.fmCcf, tier: p.fmTier } : this.plugin.zoneOf(p.venue);
    if (zone) { const zb = this.plugin.zoneBadge(zone); if (zb) meta.appendChild(zb); }
    const parts = [p.year, p.venue, p.authorsShort].filter(Boolean);
    parts.forEach((seg, j) => {
      if (j > 0) meta.createEl('span', { cls: 'od-dot-sep', text: '·' });
      meta.createSpan({ text: seg });
    });
    if (p.topics.length) {
      const chips = el.createEl('div', { cls: 'od-chips' });
      p.topics.slice(0, 4).forEach((t) => chips.createEl('span', { cls: 'od-chip', text: t }));
    }
    const foot = el.createEl('div', { cls: 'od-paper-foot' });
    const st = foot.createEl('span', { cls: 'od-status' });
    st.setAttribute('data-status', p.status);
    st.textContent = p.status;
    st.title = '点击切换状态';
    st.onclick = async (e) => {
      e.stopPropagation();
      const next = STATUSES[(STATUSES.indexOf(p.status) + 1) % STATUSES.length];
      await this.plugin.setPaperStatus(p, next);
      new Notice(`→ ${next}`);
    };
    const pr = foot.createEl('span', { cls: 'od-status jrs-prio' });
    pr.setAttribute('data-prio', p.priority || '');
    pr.textContent = p.priority || '';
    pr.title = '优先级（点击切换 高→中→低→无）';
    if (!p.priority) pr.style.display = 'none';
    pr.onclick = async (e) => {
      e.stopPropagation();
      const order = [...PRIORITIES, ''];
      await this.plugin.setPaperPriority(p, order[(order.indexOf(p.priority || '') + 1) % order.length]);
      this.renderList();
    };
    const stars = foot.createEl('span', { cls: 'od-stars' });
    for (let n = 1; n <= 5; n += 1) {
      const s = stars.createEl('button', { cls: `od-star${n <= p.rating ? ' is-on' : ''}` });
      setIcon(s, 'star');
      s.onclick = async (e) => {
        e.stopPropagation();
        await this.plugin.setPaperRating(p, p.rating === n ? 0 : n);
        this.renderList();
      };
    }
    const acts = foot.createEl('div', { cls: 'od-paper-actions' });
    const mkIcon = (icon, title, fn) => {
      const b = acts.createEl('button', { cls: 'od-icon-btn', title });
      setIcon(b, icon);
      b.onclick = (e) => { e.stopPropagation(); fn(); };
    };
    if (p.pdf) mkIcon(isHttp(p.pdf) ? 'external-link' : 'book-open-text', '打开 PDF', () => this.plugin.openPdf(p.pdf));
    mkIcon('columns-2', '分栏阅读', () => this.plugin.openReading(p));
    mkIcon('sparkles', 'AI 助手', () => new AiPaperModal(this.plugin, p, () => this.renderList()).open());
    mkIcon('file-text', '打开笔记', () => this.plugin.openPaper(p));
    el.onclick = () => this.plugin.openPaper(p);
    return el;
  }
}

class LibraryView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this._panel = new LibraryPanel(plugin);
    this._deb = null;
  }
  getViewType() { return VIEW_LIBRARY; }
  getDisplayText() { return '文献库'; }
  getIcon() { return 'library'; }
  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass('jrs-view');
    const page = this.contentEl.createEl('div', { cls: 'jrs-page' });
    const title = page.createEl('div', { cls: 'od-section-title jrs-lib-title' });
    title.createSpan({ text: '文献库' });
    this._panel.host = page;
    this._panel.render();
    this.registerEvent(this.app.metadataCache.on('changed', (f) => {
      if (f.path.startsWith(this.plugin.settings.libFolder)) this.debounced();
    }));
    this.registerEvent(this.app.vault.on('delete', () => this.debounced()));
    this.registerEvent(this.app.vault.on('rename', () => this.debounced()));
  }
  debounced() {
    if (this._deb) window.clearTimeout(this._deb);
    this._deb = window.setTimeout(() => this._panel.render(), 250);
  }
}

/* ==========================================================================
 * 弹窗
 * ========================================================================== */

class AddPaperModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
    this.data = { title: '', authors: '', year: '', venue: '', status: '待读', priority: '', topics: [], pdf: '' };
  }
  onOpen() {
    this.titleEl.setText('添加文献');
    const { contentEl } = this;
    contentEl.empty();
    const mkText = (label, key, ph) => {
      new Setting(contentEl).setName(label).addText((t) => {
        t.inputEl.placeholder = ph || '';
        t.onChange(() => { this.data[key] = t.getValue(); });
      });
    };
    mkText('标题 *', 'title', '如：基于网格剖分的敏捷卫星区域目标观测调度方法');
    mkText('作者', 'authors', '如：伍国华, 祝江汉');
    mkText('年份', 'year', '2024');
    const venueWrap = new Setting(contentEl).setName('期刊 / 会议').setDesc('输入后自动识别 CCF/科协/中科院分区');
    const venueInput = venueWrap.controlEl.createEl('input', { type: 'text' });
    venueInput.className = 'jrs-inline-input';
    venueInput.style.width = '220px';
    venueInput.placeholder = 'EJOR / Journal of Scheduling / 宇航学报…';
    const venueHint = venueWrap.controlEl.createEl('div', { cls: 'od-hint' });
    venueHint.style.cssText = 'font-size:11px;margin-top:2px;';
    let venueTimer = null;
    venueInput.oninput = () => {
      this.data.venue = venueInput.value;
      if (venueTimer) clearTimeout(venueTimer);
      venueTimer = setTimeout(async () => {
        const v = venueInput.value.trim();
        if (!v) { venueHint.textContent = ''; return; }
        const r = await this.plugin.lookupJournal(v);
        venueHint.textContent = r.found
          ? [r.cas ? `中科院${r.cas}${r.casTop ? '·Top' : ''}` : '', r.xr ? `新锐${r.xr}` : '', r.ccf ? `CCF-${r.ccf.grade}` : '', r.cast ? `科协${r.cast}` : '', r.warn ? `${r.warn}` : ''].filter(Boolean).join(' · ')
          : '（未收录，可照常保存）';
      }, 250);
    };
    new Setting(contentEl).setName('PDF 链接或库内路径（可选）').addText((t) => {
      t.inputEl.placeholder = 'https://arxiv.org/pdf/… 或 科研工作台/PDF/x.pdf';
      t.onChange(() => { this.data.pdf = t.getValue(); });
    });
    new Setting(contentEl).setName('状态').addDropdown((d) => {
      STATUSES.forEach((s) => d.addOption(s, s));
      d.setValue('待读');
      d.onChange(() => { this.data.status = d.getValue(); });
    });
    new Setting(contentEl).setName('优先级').addDropdown((d) => {
      ['', '高', '中', '低'].forEach((s) => d.addOption(s, s || '无'));
      d.onChange(() => { this.data.priority = d.getValue(); });
    });
    const topicSetting = new Setting(contentEl).setName('研究方向（可多选）');
    const chipWrap = topicSetting.infoEl.createEl('div', { cls: 'od-chips' });
    this.plugin.settings.topics.forEach((t) => {
      const c = chipWrap.createEl('span', { cls: 'od-chip od-chip--select', text: t });
      c.onclick = () => {
        if (this.data.topics.includes(t)) { this.data.topics.remove(t); c.removeClass('is-selected'); }
        else { this.data.topics.push(t); c.addClass('is-selected'); }
      };
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('创建文献笔记').setCta().onClick(async () => {
        if (!this.data.title.trim()) { new Notice('标题不能为空'); return; }
        b.setDisabled(true);
        try {
          await this.plugin.createPaperNote(this.data);
          new Notice(`已添加：${this.data.title.slice(0, 24)}…`);
          this.close();
          if (this.onDone) this.onDone();
        } catch (e) {
          new Notice(`创建失败：${e.message}`);
          b.setDisabled(false);
        }
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
}

class ImportFolderModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText('批量导入 PDF 文献');
    const { contentEl } = this;
    contentEl.empty();
    let folder = 'D:/Desktop/ycs/卫星网格化智能规划综述/文献';
    let recursive = true; let copyIn = true;
    new Setting(contentEl).setName('PDF 所在文件夹').addText((t) => {
      t.inputEl.style.width = '340px';
      t.inputEl.setValue(folder);
      t.onChange(() => { folder = t.getValue(); });
    });
    new Setting(contentEl).setName('包含子文件夹').addToggle((tg) => tg.setValue(true).onChange((v) => { recursive = v; }));
    new Setting(contentEl).setName('PDF 复制入库（推荐）').setDesc(`复制到 ${this.plugin.settings.pdfFolder}/，在 Obsidian 内直接阅读批注`).addToggle((tg) => tg.setValue(true).onChange((v) => { copyIn = v; }));
    const resultEl = contentEl.createEl('div', { cls: 'jrs-import-result' });
    new Setting(contentEl).addButton((b) => b.setButtonText('开始导入').setCta().onClick(async () => {
      b.setDisabled(true);
      resultEl.empty();
      const progress = resultEl.createEl('div', { cls: 'od-hint' });
      try {
        const res = await this.plugin.importPdfFolder(folder, recursive, copyIn, (msg) => { progress.textContent = msg; });
        new Notice(`导入完成：新增 ${res.created}，跳过 ${res.skipped}`);
        resultEl.createEl('div', { cls: 'od-hint', text: `新增 ${res.created} · 跳过 ${res.skipped} · 失败 ${res.failed}` });
        if (this.onDone) window.setTimeout(this.onDone, 400);
      } catch (err) {
        new Notice(`导入失败：${err.message}`);
        resultEl.createEl('div', { cls: 'od-hint', text: `${err.message}` });
      }
      b.setDisabled(false);
    }));
  }
}

class CardManagerModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
  }
  nameOf(id) {
    const s = this.plugin.settings;
    const b = BUILTIN_CARDS.find((c) => c.id === id);
    if (b) return s.cardTitles[id] || b.name;
    const c = s.customCards.find((x) => `c:${x.uid}` === id);
    return c ? `${c.title}（${CUSTOM_TYPES[c.type]?.name || c.type}）` : id;
  }
  display() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('p', { cls: 'od-hint', text: '排序与尺寸：总览 →「排版」模式拖拽。此处管理显隐与自定义卡片。' });
    const list = contentEl.createEl('div', { cls: 'jrs-cm-list' });
    const ids = [...BUILTIN_CARDS.map((c) => c.id), ...this.plugin.settings.customCards.map((c) => `c:${c.uid}`)];
    ids.forEach((id) => {
      const s = this.plugin.settings;
      const row = list.createEl('div', { cls: 'jrs-cm-row' });
      row.createSpan({ cls: 'jrs-cm-name', text: this.nameOf(id) });
      const hidden = s.hiddenCards.includes(id);
      const tgl = row.createEl('button', { cls: `od-btn od-btn--sm${hidden ? '' : ' od-btn--primary'}` });
      tgl.textContent = hidden ? '已隐藏' : '显示中';
      tgl.onclick = async () => {
        if (hidden) s.hiddenCards.remove(id);
        else if (!s.hiddenCards.includes(id)) s.hiddenCards.push(id);
        await this.plugin.saveSettings();
        this.display();
      };
      if (id.startsWith('c:')) {
        const del = row.createEl('button', { cls: 'od-btn od-btn--sm', text: '删除' });
        del.onclick = async () => {
          s.customCards = s.customCards.filter((x) => `c:${x.uid}` !== id);
          s.hiddenCards = s.hiddenCards.filter((x) => x !== id);
          delete s.layout[id];
          await this.plugin.saveSettings();
          this.display();
        };
      }
    });
    contentEl.createEl('h4', { text: '添加自定义卡片' });
    let type = 'note';
    const cfgBox = contentEl.createEl('div', { cls: 'jrs-cm-cfg' });
    const buildForm = () => {
      cfgBox.empty();
      const values = { title: '', ...(CUSTOM_TYPES[type].cfg || {}) };
      const fields = { title: '卡片标题' };
      if (type === 'note') fields.path = '笔记路径（库内）';
      if (type === 'countdown') { fields.label = '节点名称'; fields.date = '日期（YYYY-MM-DD）'; }
      if (type === 'web') fields.url = '网址';
      if (type === 'commands') { fields.ids = '命令 ID（逗号分隔）'; fields.labels = '显示名（逗号分隔，可空）'; }
      Object.entries(fields).forEach(([k, label]) => {
        new Setting(cfgBox).setName(label).addText((t) => {
          t.setValue(String(values[k] || ''));
          t.onChange(() => { values[k] = t.getValue(); });
        });
      });
      cfgBox._values = values;
    };
    new Setting(contentEl).setName('类型').addDropdown((d) => {
      Object.entries(CUSTOM_TYPES).forEach(([k, v]) => d.addOption(k, v.name));
      d.onChange(() => { type = d.getValue(); buildForm(); });
    });
    buildForm();
    new Setting(contentEl).addButton((b) => b.setButtonText('添加卡片').setCta().onClick(async () => {
      const v = cfgBox._values || {};
      const uid = Date.now();
      const s = this.plugin.settings;
      s.customCards.push({ uid, type, title: v.title || CUSTOM_TYPES[type].name, cfg: { ...CUSTOM_TYPES[type].cfg, ...v } });
      s.layout[`c:${uid}`] = { x: -1, y: -1, w: 2, h: 2 };
      await this.plugin.saveSettings();
      new Notice('卡片已添加');
      this.display();
    }));
  }
  onOpen() { this.display(); }
  onClose() { if (this.onDone) this.onDone(); }
}

class CardConfigModal extends Modal {
  constructor(plugin, def, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.def = def; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText(`卡片设置 · ${this.plugin.settings.cardTitles[this.def.id] || this.def.name}`);
    const { contentEl } = this;
    contentEl.empty();
    const s = this.plugin.settings;
    const cfg = { ...(s.cardCfg[this.def.id] || {}) };
    new Setting(contentEl).setName('卡片标题').addText((t) => {
      t.setValue(s.cardTitles[this.def.id] || this.def.name);
      t.onChange(() => { cfg.__title = t.getValue(); });
    });
    if (this.def.id === 'arxiv') {
      new Setting(contentEl).setName('显示条数').addText((t) => {
        t.inputEl.type = 'number';
        t.setValue(String(cfg.max || s.arxivMax));
        t.onChange(() => { const n = parseInt(t.getValue(), 10); if (n > 0 && n <= 20) cfg.max = n; });
      });
    }
    if (this.def.custom) {
      const c = this.def.custom;
      const fields = {};
      if (c.type === 'note') fields.path = '笔记路径（库内）';
      if (c.type === 'countdown') { fields.label = '节点名称'; fields.date = '日期（YYYY-MM-DD）'; }
      if (c.type === 'web') fields.url = '网址';
      if (c.type === 'commands') { fields.ids = '命令 ID（逗号分隔）'; fields.labels = '显示名（逗号分隔）'; }
      Object.entries(fields).forEach(([k, label]) => {
        new Setting(contentEl).setName(label).addText((t) => {
          t.setValue(String(c.cfg?.[k] || ''));
          t.onChange(() => { c.cfg[k] = t.getValue(); });
        });
      });
    }
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('保存').setCta().onClick(async () => {
        if (typeof cfg.__title === 'string' && cfg.__title.trim()) s.cardTitles[this.def.id] = cfg.__title.trim();
        delete cfg.__title;
        s.cardCfg[this.def.id] = cfg;
        await this.plugin.saveSettings();
        this.close();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
  onClose() { if (this.onDone) this.onDone(); }
}

class AiPaperModal extends Modal {
  constructor(plugin, paper, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.paper = paper; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText(`AI 助手 · ${this.paper.title.slice(0, 30)}…`);
    const { contentEl } = this;
    contentEl.empty();
    if (!this.plugin.settings.ai.apiKey) {
      contentEl.createEl('p', { cls: 'od-hint', text: '尚未配置 API Key：设置 → AI 助手' });
    }
    const busy = contentEl.createEl('div', { cls: 'od-hint' });
    const mk = (name, desc, fn) => {
      new Setting(contentEl).setName(name).setDesc(desc).addButton((b) => {
        b.setButtonText('运行').setCta();
        b.onClick(async () => {
          b.setDisabled(true);
          busy.textContent = `${name}生成中…`;
          try { await fn(); busy.textContent = `${name}完成`; }
          catch (e) { busy.textContent = `${e.message}`; new Notice(`${name}失败：${e.message}`); }
          b.setDisabled(false);
        });
      });
    };
    mk('生成结构化摘要', '一句话总结/问题设定/求解算法/可借鉴点', () => this.plugin.aiSummarize(this.paper));
    mk('导读十问', '10 个带参考答案的理解性问题', () => this.plugin.aiGuide(this.paper));
    mk('补全元数据', 'AI 推断 作者/年份/来源/方向/优先级 写回', async () => {
      const m = await this.plugin.aiMetadata(this.paper);
      new Notice(`已补全：${JSON.stringify(m).slice(0, 60)}…`);
    });
  }
}

class AiSynthesisModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  onOpen() {
    this.titleEl.setText('AI 跨论文综述');
    const { contentEl } = this;
    contentEl.empty();
    if (!this.plugin.settings.ai.apiKey) contentEl.createEl('p', { cls: 'od-hint', text: '提示：未配置 API Key' });
    let topic = this.plugin.settings.topics[0] || '';
    let n = 8; let goal = '';
    new Setting(contentEl).setName('研究方向 / 主题').addDropdown((d) => {
      this.plugin.settings.topics.forEach((t) => d.addOption(t, t));
      if (topic) d.setValue(topic);
      d.onChange(() => { topic = d.getValue(); });
    });
    new Setting(contentEl).setName('纳入文献数').addText((t) => {
      t.inputEl.type = 'number'; t.setValue('8');
      t.onChange(() => {
        const v = parseInt(t.getValue(), 10);
        if (v > 1 && v <= 20) n = v;
        else { new Notice('纳入数限 2-20，已忽略该值'); t.setValue(String(n)); }
      });
    });
    new Setting(contentEl).setName('研究目标（可选）').addText((t) => { t.onChange(() => { goal = t.getValue(); }); });
    const busy = contentEl.createEl('div', { cls: 'od-hint' });
    this._cancelled = false;
    const origClose = this.onClose;
    this.onClose = () => { this._cancelled = true; if (origClose) origClose(); };
    new Setting(contentEl).addButton((b) => b.setButtonText('生成综述').setCta().onClick(async () => {
      b.setDisabled(true);
      busy.textContent = '正在阅读文献并综合…（关闭弹窗可取消打开）';
      try {
        const f = await this.plugin.aiSynthesis(topic, n, goal);
        if (this._cancelled) { new Notice('综述已生成但未打开（弹窗已关闭）'); return; }
        busy.textContent = `已生成：${f.path}`;
        this.plugin.smartOpenFile(f);
      } catch (e) { if (!this._cancelled) { busy.textContent = `${e.message}`; new Notice(`综述失败：${e.message}`); } }
      if (!this._cancelled) b.setDisabled(false);
    }));
  }
}

class CaptureModal extends Modal {
  constructor(plugin) {
    super(plugin.app);
    this.plugin = plugin;
  }
  onOpen() {
    this.titleEl.setText('快速记想法（进收件箱）');
    const { contentEl } = this;
    contentEl.empty();
    let text = '';
    new Setting(contentEl).setName('想法 / 线索 / 待查文献').addTextArea((t) => {
      t.inputEl.rows = 4;
      t.inputEl.style.width = '340px';
      t.inputEl.placeholder = '如：查一下 GeoSOT 剖分在敏捷卫星上的最新应用';
      t.onChange(() => { text = t.getValue(); });
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('存入收件箱').setCta().onClick(async () => {
        if (!text.trim()) { new Notice('内容为空'); return; }
        await this.plugin.captureThought(text.trim());
        new Notice('已存入今日收件箱 ');
        this.close();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
}

class AddSubmissionModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText('新建投稿');
    const { contentEl } = this;
    contentEl.empty();
    let title = ''; let target = JOURNALS[0].abbr; let deadline = ''; let note = '';
    new Setting(contentEl).setName('论文 / 工作标题 *').addText((t) => {
      t.inputEl.placeholder = '如：网格热力驱动的多星协同调度方法';
      t.onChange(() => { title = t.getValue(); });
    });
    const jSetting = new Setting(contentEl).setName('目标期刊').setDesc('下拉选择，或手动输入其他期刊');
    const sel = jSetting.controlEl.createEl('select', { cls: 'dropdown' });
    JOURNALS.forEach((j) => {
      const o = sel.createEl('option', { value: j.abbr });
      o.textContent = `${j.abbr} — ${j.tag} · ${j.field}`;
    });
    let custom = '';
    const customInput = jSetting.controlEl.createEl('input', { type: 'text', placeholder: '其他期刊缩写（可选）' });
    customInput.className = 'jrs-inline-input';
    customInput.oninput = () => { custom = customInput.value.trim(); };
    sel.onchange = () => { target = sel.value; };
    new Setting(contentEl).setName('目标截稿日（可选）').addText((t) => {
      t.inputEl.placeholder = 'YYYY-MM-DD';
      t.onChange(() => { deadline = t.getValue().trim(); });
    });
    new Setting(contentEl).setName('备注（可选）').addTextArea((t) => {
      t.inputEl.rows = 2;
      t.inputEl.style.width = '320px';
      t.onChange(() => { note = t.getValue(); });
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('创建').setCta().onClick(async () => {
        if (!title.trim()) { new Notice('标题不能为空'); return; }
        await this.plugin.createSubmission(title.trim(), custom || target, deadline, note.trim());
        new Notice(`投稿已建档：${(custom || target)} `);
        this.close();
        if (this.onDone) this.onDone();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
}

class AddQuestionModal extends Modal {
  constructor(plugin, onDone) {
    super(plugin.app);
    this.plugin = plugin; this.onDone = onDone;
  }
  onOpen() {
    this.titleEl.setText('新建研究问题');
    const { contentEl } = this;
    contentEl.empty();
    let q = ''; let related = '';
    new Setting(contentEl).setName('问题描述 *').addTextArea((t) => {
      t.inputEl.rows = 3;
      t.inputEl.style.width = '320px';
      t.onChange(() => { q = t.getValue(); });
    });
    new Setting(contentEl).setName('相关论文（可选）').setDesc('文献笔记名，逗号分隔').addText((t) => {
      t.onChange(() => { related = t.getValue(); });
    });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText('创建').setCta().onClick(async () => {
        if (!q.trim()) { new Notice('问题描述不能为空'); return; }
        await this.plugin.createQuestion(q.trim(), related);
        new Notice('研究问题已记录 ');
        this.close();
        if (this.onDone) this.onDone();
      }))
      .addButton((b) => b.setButtonText('取消').onClick(() => this.close()));
  }
}

/* ==========================================================================
 * 设置页
 * ========================================================================== */

class JrsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    containerEl.createEl('h3', { text: '应用外壳' });
    new Setting(containerEl).setName('左侧栏').setDesc('区段导航栏的显示方式')
      .addDropdown((d) => {
        d.addOption('full', '展开（图标+文字）');
        d.addOption('icon', '仅图标');
        d.addOption('hidden', '隐藏');
        d.setValue(s.sidebarMode);
        d.onChange(async (v) => { s.sidebarMode = v; await this.plugin.saveSettings(); });
      });

    containerEl.createEl('h3', { text: '外观工作室' });
    new Setting(containerEl).setName('强调色（预设）').addDropdown((d) => {
      Object.entries(ACCENTS).forEach(([k, v]) => d.addOption(k, v.name));
      d.setValue(s.accent);
      d.onChange(async (v) => { s.accent = v; s.accentCustom = ''; await this.plugin.saveSettings(); this.plugin.applyAppearance(); this.display(); });
    });
    new Setting(containerEl).setName('强调色（自定义 HEX）').addText((t) => {
      t.setValue(s.accentCustom);
      t.onChange(async () => {
        const v = t.getValue().trim();
        if (v === '' || /^#[0-9a-fA-F]{6}$/.test(v)) { s.accentCustom = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }
      });
    });
    new Setting(containerEl).setName('毛玻璃卡片').addToggle((t) => t.setValue(s.glass).onChange(async (v) => { s.glass = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));
    const slider = (name, key, min, max, step, desc) => {
      const st = new Setting(containerEl).setName(name).setDesc(desc || '');
      st.addSlider((sl) => sl.setLimits(min, max, step).setValue(s[key]).setDynamicTooltip()
        .onChange(async (v) => { s[key] = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));
      st.addText((t) => {
        t.setValue(String(s[key]));
        t.onChange(async (v) => {
          const n = parseFloat(v);
          if (!Number.isNaN(n) && n >= min && n <= max) { s[key] = n; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }
        });
      });
      st.controlEl.addClass('jrs-slider-row');
    };
    slider('毛玻璃模糊量', 'blurPx', 0, 40, 1, '0 = 关闭模糊');
    slider('卡片不透明度', 'cardAlpha', 30, 100, 1, '照片背景下建议 65-90');
    slider('卡片圆角', 'radiusPx', 0, 28, 1);
    slider('卡片间距', 'gapPx', 6, 32, 1);
    slider('背景暗化', 'bgDim', 0, 80, 1);
    slider('看板列数', 'columns', 4, 10, 1, '改后建议重新排版');
    new Setting(containerEl).setName('背景模式').addDropdown((d) => {
      d.addOption('none', '无（跟随主题）'); d.addOption('color', '纯色'); d.addOption('image', '图片');
      d.setValue(s.bgMode);
      d.onChange(async (v) => { s.bgMode = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); });
    });
    new Setting(containerEl).setName('纯色背景').addColorPicker((c) => c.setValue(s.bgColor).onChange(async (v) => { s.bgColor = v; await this.plugin.saveSettings(); this.plugin.applyAppearance(); }));
    new Setting(containerEl).setName('背景图片（库内路径）').addText((t) => {
      t.setValue(s.bgImage);
      t.onChange(async () => { s.bgImage = t.getValue().trim(); await this.plugin.saveSettings(); this.plugin.applyAppearance(); });
    });

    containerEl.createEl('h3', { text: '路径' });
    const pathSetting = (name, key, desc) => new Setting(containerEl).setName(name).setDesc(desc || '')
      .addText((t) => { t.setValue(s[key]); t.onChange(async () => { s[key] = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    pathSetting('文献笔记目录', 'libFolder');
    pathSetting('PDF 存放目录', 'pdfFolder');
    pathSetting('研究问题目录', 'questionsFolder');
    pathSetting('投稿目录', 'submissionsFolder', '投稿管线笔记存放位置');
    pathSetting('收件箱目录', 'inboxFolder', '快速捕获的想法存放位置');
    pathSetting('图谱 Canvas', 'graphCanvas');
    pathSetting('日记目录', 'dailyFolder', '留空 = 库根目录');
    pathSetting('综述大纲笔记', 'surveyNote');
    pathSetting('Bases 目录', 'basesFolder');

    containerEl.createEl('h3', { text: '番茄钟' });
    const numSetting = (name, key, desc) => new Setting(containerEl).setName(name).setDesc(desc || '')
      .addText((t) => {
        t.inputEl.type = 'number'; t.setValue(String(s[key]));
        t.onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!Number.isNaN(n) && n > 0 && n <= 180) { s[key] = n; await this.plugin.saveSettings(); }
        });
      });
    numSetting('专注时长（分钟）', 'pomoWork', '默认 25');
    numSetting('小憩时长（分钟）', 'pomoBreak', '默认 5');
    numSetting('长休时长（分钟）', 'pomoLongBreak', '默认 15');
    numSetting('每几个番茄进入长休', 'pomoLongEvery', '默认 4');

    containerEl.createEl('h3', { text: 'arXiv' });
    new Setting(containerEl).setName('检索关键词').addText((t) => {
      t.setValue(s.arxivQuery);
      t.onChange(async () => { s.arxivQuery = t.getValue(); s.arxivCache = null; await this.plugin.saveSettings(); });
    });
    numSetting('默认显示条数', 'arxivMax');

    containerEl.createEl('h3', { text: 'AI 助手（OpenAI 兼容）' });
    new Setting(containerEl).setName('API Base URL').addText((t) => { t.setValue(s.ai.baseUrl); t.onChange(async () => { s.ai.baseUrl = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('API Key').addText((t) => { t.inputEl.type = 'password'; t.setValue(s.ai.apiKey); t.onChange(async () => { s.ai.apiKey = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    new Setting(containerEl).setName('模型').addText((t) => { t.setValue(s.ai.model); t.onChange(async () => { s.ai.model = t.getValue().trim(); await this.plugin.saveSettings(); }); });

    containerEl.createEl('h3', { text: 'MinerU 解析（可选）' });
    new Setting(containerEl).setName('MinerU 命令').addText((t) => { t.setValue(s.mineruCmd); t.onChange(async () => { s.mineruCmd = t.getValue().trim(); await this.plugin.saveSettings(); }); });

    containerEl.createEl('h3', { text: '科研' });
    new Setting(containerEl).setName('科研起始日').setDesc('YYYY-MM-DD').addText((t) => { t.setValue(s.researchStart); t.onChange(async () => { s.researchStart = t.getValue().trim(); await this.plugin.saveSettings(); }); });
    const topicSetting = new Setting(containerEl).setName('研究方向标签');
    const chipWrap = topicSetting.infoEl.createEl('div', { cls: 'od-chips' });
    const renderChips = () => {
      chipWrap.empty();
      s.topics.forEach((t) => {
        const c = chipWrap.createEl('span', { cls: 'od-chip' });
        c.createSpan({ text: t });
        const x = c.createEl('span', { text: '×', cls: 'jrs-chip-x' });
        x.onclick = async () => { s.topics.remove(t); await this.plugin.saveSettings(); renderChips(); };
      });
    };
    renderChips();
    topicSetting.addText((t) => {
      t.setPlaceholder('新方向名称');
      t.inputEl.onkeydown = async (e) => {
        if (e.key === 'Enter') {
          const v = t.getValue().trim();
          if (v && !s.topics.includes(v)) { s.topics.push(v); await this.plugin.saveSettings(); t.setValue(''); renderChips(); }
        }
      };
    });

    containerEl.createEl('h3', { text: '数据' });
    new Setting(containerEl).setName('导出插件设置').addButton((b) => b.setButtonText('复制 JSON').onClick(() => {
      navigator.clipboard?.writeText(JSON.stringify(s, null, 2)).then(() => new Notice('设置已复制到剪贴板')).catch(() => new Notice('复制失败（剪贴板不可用）'));
    }));
    new Setting(containerEl).setName('重置排版布局').addButton((b) => b.setButtonText('重置').onClick(async () => {
      s.layout = {};
      await this.plugin.saveSettings();
      new Notice('已重置');
    }));
  }
}

/* ==========================================================================
 * 主插件
 * ========================================================================== */

module.exports = class JensenResearchStationPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.pomo = new PomoEngine(this);
    this.libFilterTopic = '';

    this.registerView(VIEW_DASHBOARD, (leaf) => new DashboardView(leaf, this));
    this.registerView(VIEW_LIBRARY, (leaf) => new LibraryView(leaf, this));
    this.registerView(VIEW_SIDE, (leaf) => new SidePanelView(leaf, this));
    this.addRibbonIcon('telescope', 'Jensen 科研工作站', () => this.activateDashboard());
    this.addSettingTab(new JrsSettingTab(this.app, this));

    const cmds = [
      ['open-dashboard', '打开工作站', () => this.activateDashboard()],
      ['open-library', '打开文献库（独立视图）', () => this.activateLibrary()],
      ['sec-discover', '区段：AI 发现', () => this.gotoSection('discover')],
      ['sec-queue', '区段：阅读队列', () => this.gotoSection('queue')],
      ['sec-graph', '区段：论文图谱', () => this.gotoSection('graph')],
      ['sec-progress', '区段：研究进展', () => this.gotoSection('progress')],
      ['sec-reader', '区段：阅读笔记', () => this.gotoSection('reader')],
      ['sec-submit', '区段：投稿冲刺', () => this.gotoSection('submit')],
      ['sec-ask', '区段：知识问答', () => this.gotoSection('ask')],
      ['new-submission', '新建投稿', () => new AddSubmissionModal(this).open()],
      ['capture', '快速记想法（收件箱）', () => new CaptureModal(this).open()],
      ['daily-digest', '生成今日小结（写入日记）', () => this.generateDailyDigest()],
      ['side-panel', '打开右侧工具栏（番茄钟/查期刊/记想法）', () => this.activateSidePanel()],
      ['add-paper', '添加文献', () => new AddPaperModal(this).open()],
      ['import-pdf', '批量导入 PDF 文件夹', () => new ImportFolderModal(this).open()],
      ['start-pomo', '开始专注（番茄钟）', () => { if (this.pomo.phase === 'idle') this.pomo.start(); }],
      ['gen-matrix', '生成文献矩阵', () => this.generateMatrix()],
      ['gen-bases', '生成 Bases 数据库', () => this.generateBases()],
      ['gen-graph', '重建论文图谱', () => this.generateGraphCanvas(true)],
      ['init-survey', '初始化综述大纲', () => this.ensureSurveyNote(true)],
      ['pdf-to-vault', '外部 PDF 一键入库', () => this.migrateExternalPdfs()],
      ['card-manager', '卡片管理', () => new CardManagerModal(this).open()],
      ['refresh-arxiv', '刷新 arXiv 资讯', async () => { await this.fetchArxiv(true); new Notice('arXiv 已刷新'); }],
      ['ai-synthesis', 'AI 跨论文综述', () => new AiSynthesisModal(this).open()],
    ];
    cmds.forEach(([id, name, cb]) => this.addCommand({ id, name, callback: cb }));
    /* 编辑器 AI 三连：命令面板 + 右键菜单 */
    [['ai-polish', 'AI 学术润色（选中段落）', 'polish', 'wand-2'],
      ['ai-expand', 'AI 扩写深化（选中段落）', 'expand', 'stretch-horizontal'],
      ['ai-condense', 'AI 精简提炼（选中段落）', 'condense', 'shrink']].forEach(([id, name, mode, icon]) => {
      this.addCommand({
        id, name,
        editorCallback: (editor) => this.aiEditSelection(editor, mode),
      });
    });
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor) => {
      if (!editor || !editor.getSelection || !editor.getSelection().trim()) return;
      menu.addItem((mi) => mi.setTitle('AI 学术润色').setIcon('wand-2').onClick(() => this.aiEditSelection(editor, 'polish')));
      menu.addItem((mi) => mi.setTitle('AI 扩写深化').setIcon('stretch-horizontal').onClick(() => this.aiEditSelection(editor, 'expand')));
      menu.addItem((mi) => mi.setTitle('AI 精简提炼').setIcon('shrink').onClick(() => this.aiEditSelection(editor, 'condense')));
    }));
    this.addCommand({
      id: 'ai-active',
      name: 'AI 助手（当前文献笔记）',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const ok = f instanceof TFile && f.path.startsWith(this.settings.libFolder);
        if (checking) return ok;
        if (ok) {
          const paper = this.getPapers().find((p) => p.path === f.path) || { file: f, title: f.basename };
          new AiPaperModal(this, paper).open();
        }
        return true;
      },
    });
    this.addCommand({
      id: 'mineru-extract-active',
      name: 'MinerU 解析当前文献的 PDF',
      checkCallback: (checking) => {
        const f = this.app.workspace.getActiveFile();
        const ok = f instanceof TFile && f.path.startsWith(this.settings.libFolder);
        if (checking) return ok;
        if (ok) this.mineruExtract({ file: f }).catch((e) => new Notice(`MinerU 失败：${e.message}`));
        return true;
      },
    });

    this.app.workspace.onLayoutReady(() => {
      this.applyAppearance();
      this.ensureArxivFresh();
    });
  }

  onunload() {
    this.pomo.destroy();
    this.app.workspace.detachLeavesOfType(VIEW_DASHBOARD);
    this.app.workspace.detachLeavesOfType(VIEW_LIBRARY);
    this.app.workspace.detachLeavesOfType(VIEW_SIDE);
    document.body.removeClass('od-glass', 'jrs-bg-on');
    /* 清理注入到 body 的内联样式变量 */
    ['--od-accent', '--od-accent-soft', '--od-blur', '--od-card-alpha',
      '--od-radius-l', '--od-radius-m', '--od-gap', '--od-bg-dim',
      '--jrs-bg', '--jrs-bg-image'].forEach((k) => document.body.style.removeProperty(k));
  }

  async gotoSection(id) {
    await this.activateDashboard();
    const leaf = this.app.workspace.getLeavesOfType(VIEW_DASHBOARD)[0];
    if (leaf?.view instanceof DashboardView) await leaf.view.goto(id);
  }

  async loadSettings() {
    const stored = await this.loadData();
    this.settings = Object.assign({}, structuredClone(DEFAULT_SETTINGS), stored);
    this.settings.ai = Object.assign({}, structuredClone(DEFAULT_SETTINGS.ai), stored?.ai || {});
    if (!Array.isArray(this.settings.topics)) this.settings.topics = [...DEFAULT_TOPICS];
    if (!Array.isArray(this.settings.hiddenCards)) this.settings.hiddenCards = [];
    if (!Array.isArray(this.settings.customCards)) this.settings.customCards = [];
    if (!this.settings.layout || typeof this.settings.layout !== 'object') this.settings.layout = {};
    if (!this.settings.cardTitles) this.settings.cardTitles = {};
    if (!this.settings.cardCfg) this.settings.cardCfg = {};
    if (!this.settings.pomoLog) this.settings.pomoLog = {};
    if (!this.settings.sidebarMode) this.settings.sidebarMode = 'full';
    this.settings.hiddenCards = this.settings.hiddenCards.filter((x) => x !== 'omnibox-tip');
  }

  async saveSettings() {
    if (!String(this.settings.libFolder || '').trim()) {
      this.settings.libFolder = '科研工作台/文献';
      new Notice('文献目录不能为空，已重置为默认');
    }
    this.normalizeSettingPaths();
    await this.saveData(this.settings);
  }

  /** 库内路径字段统一清洗：反斜杠→正斜杠、去尾斜杠、非法字符拦截 */
  normalizeSettingPaths() {
    const keys = ['libFolder', 'pdfFolder', 'questionsFolder', 'submissionsFolder', 'inboxFolder', 'basesFolder', 'dailyFolder'];
    let warned = false;
    for (const k of keys) {
      const v = this.settings[k];
      if (typeof v !== 'string' || !v.trim()) continue;
      let nv = v.replace(/\\/g, '/').replace(/\/+$/, '').trim();
      if (/[:*?"<>|]/.test(nv)) {
        nv = nv.replace(/[:*?"<>|]/g, ' ');
        warned = true;
      }
      if (nv !== v) this.settings[k] = nv;
    }
    if (warned) new Notice('路径含非法字符（: * ? " < > |），已自动清理');
  }

  applyAppearance() {
    const s = this.settings;
    const hex = (/^#[0-9a-fA-F]{6}$/.test(s.accentCustom || '') && s.accentCustom) || (ACCENTS[s.accent] || ACCENTS.blue).hex;
    document.body.style.setProperty('--od-accent', hex);
    document.body.style.setProperty('--od-accent-soft', hexToRgba(hex, 0.14));
    document.body.style.setProperty('--od-blur', `${s.blurPx}px`);
    document.body.style.setProperty('--od-card-alpha', `${s.cardAlpha}%`);
    document.body.style.setProperty('--od-radius-l', `${s.radiusPx}px`);
    document.body.style.setProperty('--od-radius-m', `${Math.max(6, s.radiusPx - 4)}px`);
    document.body.style.setProperty('--od-gap', `${s.gapPx}px`);
    document.body.style.setProperty('--od-bg-dim', String(Math.min(0.9, s.bgDim / 100)));
    document.body.toggleClass('od-glass', !!s.glass);
    if (s.bgMode === 'color') {
      document.body.style.setProperty('--jrs-bg', s.bgColor || '#e8edf7');
      document.body.style.setProperty('--jrs-bg-image', 'none');
      document.body.addClass('jrs-bg-on');
    } else if (s.bgMode === 'image') {
      const f = normalizePath(s.bgImage || '') ? this.app.vault.getAbstractFileByPath(normalizePath(s.bgImage)) : null;
      let url = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      if (f instanceof TFile) url = `url("${this.app.vault.getResourcePath(f)}")`;
      document.body.style.setProperty('--jrs-bg-image', url);
      document.body.style.setProperty('--jrs-bg', 'transparent');
      document.body.addClass('jrs-bg-on');
    } else {
      document.body.style.setProperty('--jrs-bg-image', 'none');
      document.body.removeClass('jrs-bg-on');
    }
  }

  /** 智能打开文件：JRS 视图内一律开新标签页，避免吞掉工作台视图 */
  async smartOpenFile(f) {
    const ws = this.app.workspace;
    let cur = null;
    try { cur = ws.getMostRecentLeaf ? ws.getMostRecentLeaf() : ws.activeLeaf; } catch (e) { cur = null; }
    const vt = cur && cur.view && cur.view.getViewType ? cur.view.getViewType() : '';
    if (vt !== VIEW_DASHBOARD && vt !== VIEW_LIBRARY) {
      await ws.getLeaf(false).openFile(f);
      return;
    }
    /* JRS 视图内：复用同一个文件标签页，避免标签堆积 */
    if (!this._fileLeaf || !this._fileLeaf.view) this._fileLeaf = ws.getLeaf('tab');
    await this._fileLeaf.openFile(f);
  }

  async activateDashboard() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_DASHBOARD);
    if (existing.length) { workspace.revealLeaf(existing[0]); return; }
    await workspace.getLeaf(true).setViewState({ type: VIEW_DASHBOARD, active: true });
  }

  async activateSidePanel() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_SIDE);
    const leaf = existing.length ? existing[0] : workspace.getRightLeaf(false);
    if (!existing.length) await leaf.setViewState({ type: VIEW_SIDE, active: true });
    else {
      workspace.revealLeaf(leaf);
      if (leaf.isCollapsed?.()) leaf.expand?.();
    }
  }

  async openInboxNote() {
    const path = `${this.settings.inboxFolder}/${todayKey()}.md`;
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) {
      await this.ensureFolder(this.settings.inboxFolder);
      f = await this.app.vault.create(path, `# 收件箱 ${todayKey()}\n\n`);
    }
    await this.smartOpenFile(f);
  }

  async activateLibrary(topic) {
    if (topic) this.libFilterTopic = topic;
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_LIBRARY);
    const leaf = existing.length ? existing[0] : workspace.getLeaf(true);
    if (!existing.length) await leaf.setViewState({ type: VIEW_LIBRARY, active: true });
    else {
      workspace.revealLeaf(leaf);
      if (this.libFilterTopic && leaf.view instanceof LibraryView) {
        leaf.view._panel.topicFilter = this.libFilterTopic;
        this.libFilterTopic = '';
        leaf.view._panel.render();
      }
    }
  }

  /* ---------- 日记 ---------- */

  dailyPath(key) {
    const k = key || todayKey();
    const folder = this.settings.dailyFolder ? `${this.settings.dailyFolder}/` : '';
    return `${folder}${k}.md`;
  }
  findDailyNote(key) {
    const f = this.app.vault.getAbstractFileByPath(this.dailyPath(key));
    return f instanceof TFile ? f : null;
  }
  async openDailyNote(key) {
    let f = this.findDailyNote(key);
    if (!f) {
      const k = key || todayKey();
      try {
        if (this.settings.dailyFolder) await this.ensureFolder(this.settings.dailyFolder);
        f = await this.app.vault.create(this.dailyPath(key), `# ${k}\n\n## 今日待办\n\n## 专注记录\n`);
      } catch (e) {
        new Notice(`日记创建失败：${e.message}（检查设置中的日记目录）`);
        return;
      }
    }
    await this.smartOpenFile(f);
  }
  appendPomoToDaily(minutes) {
    try {
      const f = this.findDailyNote();
      if (f) this.app.vault.append(f, `\n- 专注 ${minutes} 分钟（${window.moment().format('HH:mm')}）`);
    } catch (e) { /* 不影响计时 */ }
  }
  todayPomoMinutes() { return (this.settings.pomoLog[todayKey()] || {}).minutes || 0; }

  async getTodayTasks() {
    const f = this.findDailyNote();
    if (!f) return [];
    const content = await this.app.vault.cachedRead(f);
    const tasks = [];
    content.split('\n').forEach((line, i) => {
      const m = line.match(/^(\s*)- \[( |x|X)\] (.+)$/);
      if (m) tasks.push({ line: i, done: m[2].toLowerCase() === 'x', text: m[3].trim() });
    });
    return tasks;
  }
  async toggleDailyTask(task) {
    const f = this.findDailyNote();
    if (!f) return;
    await this.app.vault.process(f, (content) => {
      const lines = content.split('\n');
      const t = lines[task.line];
      if (t == null) return content;
      lines[task.line] = task.done ? t.replace(/^(\s*)- \[x\]/i, '$1- [ ]') : t.replace(/^(\s*)- \[ \]/, '$1- [x]');
      return lines.join('\n');
    });
  }
  async appendDailyTask(text) {
    let f = this.findDailyNote();
    if (!f) {
      await this.openDailyNote();
      f = this.findDailyNote();
      if (!f) return;
    }
    await this.app.vault.process(f, (content) => {
      const lines = content.split('\n');
      const re = /^(\s*)- \[( |x|X)\] /;
      let last = -1;
      for (let i = 0; i < lines.length; i += 1) if (re.test(lines[i])) last = i;
      const line = `- [ ] ${text}`;
      if (last >= 0) lines.splice(last + 1, 0, line);
      else {
        const hi = lines.findIndex((l) => /^## 今日待办/.test(l));
        if (hi >= 0) lines.splice(hi + 1, 0, '', line);
        else lines.push('', '## 今日待办', '', line);
      }
      return lines.join('\n');
    });
  }

  /* ---------- 文献 ---------- */

  getPapers() {
    const folder = this.settings.libFolder;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + '/') || f.path === folder);
    return files.map((f) => {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      const topics = Array.isArray(fm.topics) ? fm.topics : (typeof fm.topics === 'string' && fm.topics ? [fm.topics] : []);
      const authors = Array.isArray(fm.authors) ? fm.authors.join(', ') : (fm.authors || '');
      const arr = authors.split(/[,，;；]/).filter(Boolean);
      const progressRaw = fm.reading_progress ?? fm.progress ?? 0;
      return {
        file: f, path: f.path, added: f.stat.ctime,
        title: fm.title || f.basename,
        authors, authorsShort: arr.length ? arr[0] + (arr.length > 1 ? ' 等' : '') : '',
        year: fm.year ? String(fm.year) : '',
        venue: fm.venue || '',
        status: STATUSES.includes(fm.status) ? fm.status : '待读',
        priority: PRIORITIES.includes(fm.priority) ? fm.priority : '',
        topics: topics.filter(Boolean),
        rating: typeof fm.rating === 'number' ? fm.rating : 0,
        progress: Math.max(0, Math.min(100, Number(progressRaw) || 0)),
        pdf: fm.pdf || '',
        summary: typeof fm.summary === 'string' ? fm.summary : '',
        project: typeof fm.project === 'string' ? fm.project : '',
        fmCas: typeof fm.cas === 'string' ? fm.cas : '',
        fmCasTop: fm.cas_top === true,
        fmXr: typeof fm.xr_zone === 'string' ? fm.xr_zone : '',
        fmCcf: typeof fm.ccf === 'string' ? fm.ccf : '',
        fmTier: typeof fm.cast_tier === 'string' ? fm.cast_tier : '',
      };
    });
  }

  getPapersSorted(sort) {
    const papers = this.getPapers();
    if (sort === 'year') return papers.sort((a, b) => (b.year || '0').localeCompare(a.year || '0'));
    if (sort === 'title') return papers.sort((a, b) => a.title.localeCompare(b.title, 'zh'));
    if (sort === 'rating') return papers.sort((a, b) => b.rating - a.rating);
    if (sort === 'priority') {
      const rank = { 高: 0, 中: 1, 低: 2, '': 3 };
      return papers.sort((a, b) => rank[a.priority] - rank[b.priority] || b.rating - a.rating);
    }
    return papers.sort((a, b) => b.added - a.added);
  }

  papersAddedThisWeek() {
    const weekAgo = Date.now() - 7 * 86400 * 1000;
    return this.getPapers().filter((p) => p.added >= weekAgo).length;
  }

  /** 进度推进：>0 自动转阅读中，=100 自动转已完成 */
  async bumpProgress(p, delta) {
    const next = Math.max(0, Math.min(100, p.progress + delta));
    await this.app.fileManager.processFrontMatter(p.file, (fm) => {
      fm.reading_progress = next;
      if (next >= 100) fm.status = '已完成';
      else if (next > 0 && (fm.status === '待读' || !fm.status)) fm.status = '阅读中';
    });
  }

  async ensureFolder(path) {
    if (!path) return;
    const parts = normalizePath(path).split('/').filter(Boolean);
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) await this.app.vault.createFolder(cur);
    }
  }

  async createPaperNote(data, open = true) {
    const folder = this.settings.libFolder;
    await this.ensureFolder(folder);
    let zoneFm = {};
    if (data.venue) {
      const r = await this.lookupJournal(data.venue);
      if (r.found) {
        zoneFm = {
          cas: r.cas || '', casTop: !!r.casTop, xr: r.xr || '',
          ccf: r.ccf ? r.ccf.grade : '', cast: r.cast || '',
        };
      }
    }
    const name = sanitizeFilename(data.title) || `文献 ${todayKey()}`;
    let path = `${folder}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(path)) path = `${folder}/${name} (${todayKey()}).md`;
    const pdfVal = toPosix(data.pdf || '');
    const fm = [
      '---',
      `title: "${String(data.title).replace(/"/g, "'")}"`,
      data.authors ? `authors: "${String(data.authors).replace(/"/g, "'")}"` : 'authors: ""',
      data.year ? `year: ${data.year}` : 'year: ',
      data.venue ? `venue: "${String(data.venue).replace(/"/g, "'")}"` : 'venue: ""',
      `status: ${data.status || '待读'}`,
      data.priority ? `priority: ${data.priority}` : 'priority: ',
      data.topics && data.topics.length ? `topics: [${data.topics.map((t) => `"${t}"`).join(', ')}]` : 'topics: []',
      'rating: 0',
      'reading_progress: 0',
      pdfVal ? `pdf: "${pdfVal.replace(/"/g, "'")}"` : 'pdf: ""',
      ...(zoneFm.cas ? [`cas: ${zoneFm.cas}`] : []),
      ...(zoneFm.casTop ? ['cas_top: true'] : []),
      ...(zoneFm.xr ? [`xr_zone: ${zoneFm.xr}`] : []),
      ...(zoneFm.ccf ? [`ccf: ${zoneFm.ccf}`] : []),
      ...(zoneFm.cast ? [`cast_tier: ${zoneFm.cast}`] : []),
      `added: ${todayKey()}`,,
      '---',
      '',
    ].join('\n');
    const pdfLink = pdfVal && !isHttp(pdfVal) && !isExternalPath(pdfVal) ? `\n原文:  原文：[[${pdfVal.split('/').pop()}]]\n` : '';
    const body = [
      `# ${data.title}`, '', pdfLink.trim(),
      '## 一句话总结', '', '## 问题设定（卫星/目标/约束）', '',
      '## 网格 / 方法如何使用', '', '## 求解算法', '',
      '## 可借鉴点', '', '## 疑问与待办', '- [ ] ', '',
    ].join('\n');
    const file = await this.app.vault.create(path, fm + body);
    if (open) await this.smartOpenFile(file);
    return file;
  }

  async setPaperStatus(p, status) {
    await this.app.fileManager.processFrontMatter(p.file, (fm) => {
      fm.status = status;
      if (status === '已完成') fm.reading_progress = 100;
    });
  }
  async setPaperRating(p, rating) { await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.rating = rating; }); }
  async setPaperPriority(p, priority) { await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.priority = priority || ''; }); }
  async openPaper(p) { await this.smartOpenFile(p.file); }

  async openReading(p) {
    await this.smartOpenFile(p.file);
    const pdf = p.pdf;
    if (!pdf || isHttp(pdf)) { if (isHttp(pdf)) window.open(pdf); return; }
    const f = this.app.vault.getAbstractFileByPath(normalizePath(toPosix(pdf)));
    if (f instanceof TFile) {
      /* 复用同一个右侧叶，避免 PDF 面板堆积 */
      if (!this._rightPdfLeaf || !this._rightPdfLeaf.view) this._rightPdfLeaf = this.app.workspace.getRightLeaf(false);
      await this._rightPdfLeaf.openFile(f, { active: false });
    } else new Notice('PDF 不在库内：可用「PDF 入库」迁移后分栏阅读');
  }

  async openPdf(pdf) {
    if (!pdf) return;
    if (isHttp(pdf)) { window.open(pdf); return; }
    const f = this.app.vault.getAbstractFileByPath(normalizePath(toPosix(pdf)));
    if (f instanceof TFile) { this.smartOpenFile(f); return; }
    if (isExternalPath(pdf)) {
      try {
        const electron = window.require && window.require('electron');
        if (electron?.shell?.openPath) {
          const err = await electron.shell.openPath(pdf);
          if (err) new Notice(`打开失败：${err}`);
          return;
        }
      } catch (e) { /* fallthrough */ }
      try { if (this.app.openWithDefaultApp) { this.app.openWithDefaultApp(pdf); return; } } catch (e) { /* fallthrough */ }
      navigator.clipboard?.writeText(pdf);
      new Notice('已复制 PDF 路径');
      return;
    }
    new Notice(`找不到 PDF：${pdf}`);
  }

  /* ---------- 批量导入 ---------- */

  async importPdfFolder(folderPath, recursive, copyIntoVault, onProgress) {
    if (!window.require) throw new Error('仅桌面端支持');
    const fs = window.require('fs');
    const pathMod = window.require('path');
    if (!fs.existsSync(folderPath)) throw new Error(`文件夹不存在：${folderPath}`);
    const pdfs = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = pathMod.join(dir, e.name);
        if (e.isDirectory()) { if (recursive) walk(full); }
        else if (/\.pdf$/i.test(e.name)) pdfs.push(full);
      }
    };
    walk(folderPath);
    if (!pdfs.length) throw new Error('没有找到 PDF');
    if (copyIntoVault) await this.ensureFolder(this.settings.pdfFolder);
    const existing = new Set(this.getPapers().map((p) => p.title.toLowerCase()));
    const res = { created: 0, skipped: 0, failed: 0 };
    for (let i = 0; i < pdfs.length; i += 1) {
      const full = pdfs[i];
      const base = pathMod.basename(full);
      const { title, year } = guessFromFilename(base);
      onProgress(`(${i + 1}/${pdfs.length}) ${title.slice(0, 40)}…`);
      if (existing.has(title.toLowerCase())) { res.skipped += 1; continue; }
      try {
        let pdfField = toPosix(full);
        if (copyIntoVault) {
          const rel = `${this.settings.pdfFolder}/${base}`;
          if (!(this.app.vault.getAbstractFileByPath(rel) instanceof TFile)) {
            const buf = fs.readFileSync(full);
            const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
            await this.app.vault.adapter.writeBinary(normalizePath(rel), ab);
          }
          pdfField = rel;
        }
        await this.createPaperNote({ title, year, authors: '', venue: '', status: '待读', topics: [], pdf: pdfField }, false);
        existing.add(title.toLowerCase());
        res.created += 1;
      } catch (e) { console.error('[JRS] 导入失败', full, e); res.failed += 1; }
    }
    return res;
  }

  async migrateExternalPdfs() {
    if (!window.require) { new Notice('仅桌面端支持'); return; }
    const fs = window.require('fs');
    const papers = this.getPapers().filter((p) => p.pdf && isExternalPath(p.pdf));
    if (!papers.length) { new Notice('没有外部路径的 PDF'); return; }
    await this.ensureFolder(this.settings.pdfFolder);
    let ok = 0; let fail = 0;
    new Notice(`开始迁移 ${papers.length} 个 PDF…`);
    for (const p of papers) {
      try {
        const base = toPosix(p.pdf).split('/').pop();
        const rel = `${this.settings.pdfFolder}/${base}`;
        if (!(this.app.vault.getAbstractFileByPath(rel) instanceof TFile)) {
          const buf = fs.readFileSync(p.pdf);
          const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          await this.app.vault.adapter.writeBinary(normalizePath(rel), ab);
        }
        await this.app.fileManager.processFrontMatter(p.file, (fm) => { fm.pdf = rel; });
        const content = await this.app.vault.cachedRead(p.file);
        if (!content.includes(`[[${base}]]`)) {
          await this.app.vault.modify(p.file, content.replace(/^# .+\n/, (m) => `${m}\n原文:  原文：[[${base}]]\n`));
        }
        ok += 1;
      } catch (e) { fail += 1; console.error('[JRS] PDF 迁移失败', p.pdf, e); }
    }
    new Notice(`迁移完成：成功 ${ok}，失败 ${fail}`);
  }

  /* ---------- arXiv ---------- */

  async fetchArxiv(force = false) {
    const cache = this.settings.arxivCache;
    if (!force && cache?.ts && Date.now() - cache.ts < 12 * 3600 * 1000 && cache.items?.length) {
      return { ...cache, justFetched: false };
    }
    try {
      const q = this.settings.arxivQuery.trim().split(/\s+/).map(encodeURIComponent).join('+');
      const url = `https://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=${Math.max(this.settings.arxivMax, 10)}`;
      const resp = await requestUrl({ url, method: 'GET', throw: false });
      if (resp.status !== 200) throw new Error(`arXiv 返回 ${resp.status}`);
      const doc = new DOMParser().parseFromString(resp.text, 'text/xml');
      const items = [...doc.querySelectorAll('entry')].map((en) => {
        const pick = (sel) => en.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() || '';
        const alt = [...en.querySelectorAll('link')].find((l) => l.getAttribute('type') === 'text/html')?.getAttribute('href')
          || [...en.querySelectorAll('link')].pop()?.getAttribute('href') || '';
        return {
          title: pick('title'),
          date: pick('published').slice(0, 10),
          authors: [...en.querySelectorAll('author > name')].slice(0, 3).map((a) => a.textContent.trim()).join(', '),
          url: alt,
          summary: pick('summary').slice(0, 300),
        };
      }).filter((x) => x.title);
      this.settings.arxivCache = { ts: Date.now(), items };
      await this.saveSettings();
      return { ...this.settings.arxivCache, justFetched: true };
    } catch (e) {
      console.error('[JRS] arXiv 获取失败', e);
      return { ts: cache?.ts || 0, items: cache?.items || [], justFetched: false };
    }
  }

  /** Crossref 正式期刊检索（v0.9） */
  async searchCrossref(query, n = 8) {
    const q = (query || 'satellite scheduling').trim();
    const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=${Math.min(20, Math.max(3, n))}&sort=relevance&select=title,author,container-title,issued,DOI,abstract`;
    const resp = await requestUrl({ url, method: 'GET', throw: false });
    if (resp.status !== 200) throw new Error(`Crossref 返回 ${resp.status}`);
    const items = (resp.json?.message?.items || []).map((w) => {
      const title = (w.title || [])[0] || '';
      const venue = (w['container-title'] || [])[0] || '';
      const year = (w.issued?.['date-parts'] || [[]])[0][0];
      const authors = (w.author || []).slice(0, 3).map((a) => [a.family, a.given].filter(Boolean).join(' ')).join(', ');
      const abs = w.abstract ? w.abstract.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
      return {
        source: 'crossref', title, venue, authors,
        date: year ? String(year) : '',
        year: year ? String(year) : '',
        url: w.DOI ? `https://doi.org/${w.DOI}` : '',
        doi: w.DOI || '',
        summary: abs.slice(0, 300),
      };
    }).filter((x) => x.title && (x.venue ? !x.venue.toLowerCase().includes('preprint') : true));
    return items;
  }

  async crossrefToLibrary(it) {
    const topics = this.settings.topics.filter((t) => `${it.title} ${it.summary}`.toLowerCase().includes(t.toLowerCase().slice(0, 4)));
    return this.createPaperNote({
      title: it.title,
      authors: JensenResearchStationPlugin.normalizeAuthors(it.authors),
      year: it.year,
      venue: it.venue,
      status: '待读',
      topics: topics.slice(0, 3),
      pdf: it.doi ? `https://doi.org/${it.doi}` : '',
    }, false);
  }

  async ensureArxivFresh() {
    const before = this.settings.arxivCache?.ts || 0;
    const result = await this.fetchArxiv(false);
    if ((result?.ts || 0) > before && result.items?.length) {
      const leaf = this.app.workspace.getLeavesOfType(VIEW_DASHBOARD)[0];
      if (leaf?.view instanceof DashboardView && leaf.view.section === 'home') leaf.view.softRefresh('arxiv');
    }
    return result;
  }

  /** 作者串归一：'Caldeiras , Paulo' → 'Paulo Caldeiras' 类脏空格清理 */
  static normalizeAuthors(s) {
    return String(s || '').replace(/\s*,\s*/g, ', ').replace(/,([^ ])/g, ', $1').trim();
  }

  async arxivToLibrary(it) {
    const year = it.date ? it.date.slice(0, 4) : '';
    const topics = this.settings.topics.filter((t) => `${it.title} ${it.summary}`.toLowerCase().includes(t.toLowerCase().slice(0, 4)));
    return this.createPaperNote({
      title: it.title, authors: JensenResearchStationPlugin.normalizeAuthors(it.authors), year, venue: 'arXiv',
      status: '待读', topics: topics.slice(0, 3),
      pdf: it.url ? it.url.replace('/abs/', '/pdf/') : '',
    }, false);
  }

  /* ---------- AI ---------- */

  async aiChat(system, user, maxTokens = 900) {
    const ai = this.settings.ai;
    if (!ai.apiKey) throw new Error('请先在 设置 → AI 助手 填写 API Key');
    const resp = await requestUrl({
      url: `${ai.baseUrl.replace(/\/$/, '')}/chat/completions`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ai.apiKey}` },
      body: JSON.stringify({
        model: ai.model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.3, max_tokens: maxTokens,
      }),
      throw: false,
    });
    if (resp.status !== 200) throw new Error(`API ${resp.status}：${(resp.text || '').slice(0, 120)}`);
    const out = resp.json?.choices?.[0]?.message?.content || '';
    if (!out) throw new Error('模型返回为空');
    return out;
  }

  async readPaperBody(paper) {
    const content = await this.app.vault.cachedRead(paper.file);
    return content.split('---').slice(2).join('---').slice(0, 4000);
  }

  async aiSummarize(paper) {
    const source = await this.readPaperBody(paper);
    const out = await this.aiChat(
      '你是严谨的科研助理。根据文献笔记生成四个部分的简明中文要点。只输出 markdown 正文。',
      `文献笔记：\n${source}\n\n请输出（使用这些确切标题）：\n## 一句话总结\n## 问题设定（卫星/目标/约束）\n## 求解算法\n## 可借鉴点`,
 );
    const content = await this.app.vault.cachedRead(paper.file);
    let c = content;
    ['一句话总结', '问题设定（卫星/目标/约束）', '求解算法', '可借鉴点'].forEach((h) => {
      const m = out.match(new RegExp(`## ${h.replace(/[()]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`));
      if (m && m[1].trim()) c = replaceSection(c, h, m[1].trim());
    });
    await this.app.vault.modify(paper.file, c);
    new Notice('AI 摘要已写入 sparkles');
    await this.smartOpenFile(paper.file);
  }

  async aiGuide(paper) {
    const source = await this.readPaperBody(paper);
    const out = await this.aiChat(
      '你是导师，为研究生生成论文导读问题。只输出 markdown 正文。',
      `文献：\n${source}\n\n生成 10 个帮助深入理解该论文的问题，每题附 2-3 句参考答案。格式：\n## 导读十问\n1. **问题**\n   - 参考：…`,
      1400,
 );
    const content = await this.app.vault.cachedRead(paper.file);
    const m = out.match(/## 导读十问[\s\S]*/);
    await this.app.vault.modify(paper.file, replaceSection(content, '导读十问', (m ? m[0] : out).replace(/^## 导读十问\s*\n/, '')));
    new Notice('导读十问已生成 ');
    await this.smartOpenFile(paper.file);
  }

  async aiMetadata(paper) {
    const content = await this.app.vault.cachedRead(paper.file);
    const body = content.split('---').slice(2).join('---').slice(0, 2000);
    const out = await this.aiChat(
      '从文献信息推断元数据，只输出 JSON。',
      `标题与内容：\n${paper.title}\n${body}\n\n输出 JSON：{"authors":"第一作者等","year":"2024","venue":"期刊/会议","priority":"高|中|低","topics":["从候选中选：${this.settings.topics.join('/')}"],"summary":"一句话中文总结"}`,
      500,
 );
    let m;
    try { m = JSON.parse(out.replace(/```json|```/g, '').trim()); } catch (e) { throw new Error('模型输出无法解析为 JSON'); }
    await this.app.fileManager.processFrontMatter(paper.file, (fm) => {
      if (m.authors && (!fm.authors || fm.authors === '""')) fm.authors = String(m.authors).slice(0, 120);
      if (m.year && !fm.year) fm.year = String(m.year).slice(0, 4);
      if (m.venue && (!fm.venue || fm.venue === '""')) fm.venue = String(m.venue).slice(0, 80);
      if (m.priority && PRIORITIES.includes(m.priority)) fm.priority = m.priority;
      if (Array.isArray(m.topics)) {
        const valid = m.topics.filter((t) => this.settings.topics.includes(t)).slice(0, 4);
        if (valid.length) fm.topics = valid;
      }
      if (m.summary) fm.summary = String(m.summary).slice(0, 200);
    });
    if (m.summary) {
      const c = await this.app.vault.cachedRead(paper.file);
      await this.app.vault.modify(paper.file, replaceSection(c, '一句话总结', m.summary));
    }
    return m;
  }

  async aiSynthesis(topic, n, goal) {
    const papers = this.getPapers()
      .filter((p) => topic === '' || p.topics.includes(topic))
      .sort((a, b) => (b.topics.includes(topic) ? 1 : 0) - (a.topics.includes(topic) ? 1 : 0) || b.rating - a.rating)
      .slice(0, n);
    if (papers.length < 2) throw new Error(`「${topic}」方向文献不足 2 篇`);
    const digest = papers.map((p, i) => `[${i + 1}] ${p.title}（${p.year || '年份未知'}${p.venue ? ', ' + p.venue : ''}）${p.summary || p.topics.join('/')}`).join('\n');
    const out = await this.aiChat(
      '你是撰写文献综述的科研助理。基于给定文献输出结构化中文综述（markdown），结论标注来源编号。',
      `主题：${topic}\n研究目标：${goal || '围绕主题展开'}\n文献列表：\n${digest}\n\n输出结构：\n## 当前结论\n## 共同认识\n## 分歧与对比\n## 方法比较（表格）\n## 研究空白\n## 下一步建议`,
      2000,
 );
    const dir = this.settings.surveyNote.split('/').slice(0, -1).join('/') || '';
    const path = `${dir ? dir + '/' : ''}AI 综述 - ${topic} ${todayKey()}.md`;
    const content = [
      `# AI 综述 · ${topic}`, '',
      `> 生成于 ${window.moment().format('YYYY-MM-DD HH:mm')} · 纳入 ${papers.length} 篇 · 模型 ${this.settings.ai.model}`,
      `> 文献：${papers.map((p, i) => `[[${p.file.basename}|${i + 1}]]`).join(' ')}`, '', out, '',
    ].join('\n');
    const old = this.app.vault.getAbstractFileByPath(path);
    if (old instanceof TFile) { await this.app.vault.modify(old, content); return old; }
    return await this.app.vault.create(path, content);
  }

  /* ---------- MinerU ---------- */

  async mineruExtract(paper) {
    if (!window.require) throw new Error('仅桌面端支持');
    const { exec } = window.require('child_process');
    const fs = window.require('fs');
    const pathMod = window.require('path');
    const content = await this.app.vault.cachedRead(paper.file);
    const fmPdf = (content.match(/^pdf: "(.*)"$/m) || [])[1] || '';
    if (!fmPdf) throw new Error('该笔记没有 pdf 字段');
    if (isHttp(fmPdf)) throw new Error('在线 PDF 请先下载入库');
    const basePath = this.app.vault.adapter?.basePath;
    let absPdf = fmPdf;
    if (!isExternalPath(fmPdf)) {
      if (!basePath) throw new Error('无法定位库路径');
      absPdf = pathMod.join(basePath, normalizePath(fmPdf));
    }
    if (!fs.existsSync(absPdf)) throw new Error(`PDF 不存在：${absPdf}`);
    const outDir = pathMod.join(basePath, '.jrs-tmp', `mineru-${Date.now()}`);
    new Notice('MinerU 解析中，可能需要几分钟…');
    await new Promise((resolve, reject) => {
      exec(`"${this.settings.mineruCmd}" -p "${absPdf}" -o "${outDir}"`, {
        timeout: 10 * 60 * 1000, maxBuffer: 32 * 1024 * 1024, windowsHide: true,
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(`${err.message}\n${String(stderr).slice(0, 200)}`));
        else resolve(stdout);
      });
    });
    const findMd = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = pathMod.join(dir, e.name);
        if (e.isDirectory()) { const r = findMd(full); if (r) return r; }
        else if (/\.md$/i.test(e.name)) return full;
      }
      return null;
    };
    const md = findMd(outDir);
    if (!md) throw new Error('未找到 MinerU 输出');
    let text = fs.readFileSync(md, 'utf-8');
    if (text.length > 60000) text = `${text.slice(0, 60000)}\n\n…（过长已截断）`;
    await this.app.vault.modify(paper.file, replaceSection(content, '原文提取（MinerU）', text));
    new Notice('MinerU 解析已写入 ');
  }

  /* ---------- 研究问题 ---------- */

  async getQuestions() {
    const folder = this.settings.questionsFolder;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + '/'));
    return files.map((f) => {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      return {
        file: f, added: f.stat.ctime,
        question: fm.question || f.basename,
        status: fm.status === 'answered' ? 'answered' : 'open',
      };
    }).sort((a, b) => b.added - a.added);
  }

  async createQuestion(q, related = '') {
    await this.ensureFolder(this.settings.questionsFolder);
    const name = sanitizeFilename(q);
    let path = `${this.settings.questionsFolder}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(path)) path = `${this.settings.questionsFolder}/${name} ${todayKey()}.md`;
    const rel = related.split(/[,，;；]/).map((x) => x.trim()).filter(Boolean)
      .map((x) => `[[${x}]]`).join(' ');
    const content = [
      '---',
      `question: "${q.replace(/"/g, "'")}"`,
      'status: open',
      `created: ${todayKey()}`,
      '---',
      '',
      `# ${q}`,
      '',
      rel ? `相关文献：${rel}` : '',
      '',
      '## 背景',
      '',
      '## 尝试 / 思路',
      '',
      '## 结论',
      '',
    ].filter((x) => x !== undefined).join('\n');
    return await this.app.vault.create(path, content);
  }

  async toggleQuestion(q) {
    await this.app.fileManager.processFrontMatter(q.file, (fm) => {
      fm.status = fm.status === 'answered' ? 'open' : 'answered';
    });
  }

  /* ---------- 知识问答（ima 式 grounding + 引用） ---------- */

  async aiAsk(question) {
    if (!this.settings.ai.apiKey) throw new Error('请先在 设置 → AI 助手 配置 API Key');
    const papers = this.getPapers();
    if (!papers.length) throw new Error('文献库为空');
    /* 简易分词：英文词 + 中文 bigram，去停用词 */
    const stop = new Set(['如何', '哪些', '什么', '作用', '方法', '问题', '研究', '一个', '可以', '以及', '常用', '进行', '之间', '对于']);
    const latin = (question.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []);
    const cjkRaw = question.match(/[\u4e00-\u9fff]{2,}/g) || [];
    const terms = new Set();
    latin.forEach((w) => terms.add(w));
    cjkRaw.forEach((seg) => {
      for (let i = 0; i + 2 <= seg.length; i += 1) {
        const g = seg.slice(i, i + 2);
        if (!stop.has(g)) terms.add(g);
      }
    });
    const scored = papers.map((p) => {
      let s = 0;
      const title = p.title.toLowerCase();
      const sum = (p.summary || '').toLowerCase();
      const topics = p.topics.join(' ').toLowerCase();
      terms.forEach((t) => {
        if (title.includes(t)) s += 3;
        if (topics.includes(t)) s += 2;
        if (sum.includes(t)) s += 1;
      });
      s += p.rating * 0.3 + (p.priority === '高' ? 1 : p.priority === '中' ? 0.5 : 0) + (p.status === '已完成' ? 0.5 : 0);
      return { p, s };
    }).filter((x) => x.s > 1).sort((a, b) => b.s - a.s).slice(0, 6);
    const picked = scored.length ? scored.map((x) => x.p) : papers.slice(0, 4);
    const ctx = picked.map((p, i) => `[${i + 1}] ${p.title}（${p.year || ''}${p.venue ? ' · ' + p.venue : ''}）方向: ${p.topics.join('/') || '未标注'} 摘要: ${p.summary || p.authorsShort || '（详见笔记，摘要未生成）'}`).join('\n');
    const out = await this.aiChat(
      '你是严谨的科研助理。只依据给定文献回答，关键结论后用 [n] 标注来源编号；文献不足以回答时明确说明。用中文，输出 markdown 要点。',
      `问题：${question}\n\n文献：\n${ctx}\n\n输出：直接给答案（可分点），关键处标注 [n]。`,
      1200,
 );
    return { q: question, a: out, sources: picked };
  }

  async appendAnswerToQuestion(q, a) {
    const name = sanitizeFilename(q);
    const f = this.app.vault.getAbstractFileByPath(`${this.settings.questionsFolder}/${name}.md`)
      || this.app.vault.getAbstractFileByPath(`${this.settings.questionsFolder}/${name} ${todayKey()}.md`);
    if (!(f instanceof TFile)) return null;
    await this.app.vault.append(f, `\n## AI 解答（${window.moment().format('M月D日 HH:mm')}）\n\n${a}\n`);
    return f;
  }

  /** AI 起草大纲章节：检索文献 → 初稿带来源写回大纲（可重复起草，覆盖旧稿） */
  async aiDraftSection(sectionName) {
    if (!this.settings.ai.apiKey) throw new Error('请先在 设置 → AI 助手 配置 API Key');
    const f = this.app.vault.getAbstractFileByPath(this.settings.surveyNote);
    if (!(f instanceof TFile)) throw new Error('综述大纲不存在');
    const content = await this.app.vault.cachedRead(f);

    const lines = content.split('\n');
    const hIdx = lines.findIndex((l) => l.trim() === `## ${sectionName}`);
    if (hIdx === -1) throw new Error(`未找到章节：${sectionName}`);
    let end = lines.length;
    for (let i = hIdx + 1; i < lines.length; i += 1) { if (/^## /.test(lines[i])) { end = i; break; } }
    const bullets = lines.slice(hIdx + 1, end).filter((l) => /^\s*- \[/.test(l)).map((l) => l.trim()).join('\n');

    const papers = this.getPapers();
    if (!papers.length) throw new Error('文献库为空');
    const segs = sectionName.match(/[\u4e00-\u9fff a-zA-Z0-9]{2,}/g) || [sectionName];
    const terms = new Set();
    segs.forEach((seg) => {
      for (let i = 0; i + 2 <= seg.length; i += 1) terms.add(seg.slice(i, i + 2).toLowerCase());
    });
    const scored = papers.map((p) => {
      let s = 0;
      const t = p.title.toLowerCase();
      const sm = (p.summary || '').toLowerCase();
      const tp = p.topics.join(' ').toLowerCase();
      terms.forEach((term) => {
        if (t.includes(term)) s += 3;
        if (tp.includes(term)) s += 2;
        if (sm.includes(term)) s += 1;
      });
      s += p.rating * 0.3 + (p.priority === '高' ? 1 : 0);
      return { p, s };
    }).filter((x) => x.s > 1).sort((a, b) => b.s - a.s).slice(0, 5);
    const picked = scored.length ? scored.map((x) => x.p) : papers.slice(0, 3);
    const ctx = picked.map((p, i) => `[${i + 1}] ${p.title}（${p.year || '年份未知'}${p.venue ? ' · ' + p.venue : ''}）${p.summary || p.topics.join('/') || ''}`).join('\n');

    const out = await this.aiChat(
      '你是运筹学/航天领域的综述写作助理。依据给定文献起草综述章节初稿：中文、学术书面语、2-3 个自然段，关键论断后标注 [n] 来源编号；不要杜撰文献中不存在的内容。只输出 markdown 正文。',
      `章节标题：${sectionName}\n该章节已有写作要点：\n${bullets || '（暂无）'}\n\n相关文献：\n${ctx}\n\n请起草该章节初稿。`,
      1600,
 );

    const startMark = `<!--jrs-draft:${sectionName}-->`;
    const srcLinks = picked.map((p, i) => `[[${p.file.basename}|${i + 1}]]`).join(' ');
    const block = [
      startMark,
      `> [!NOTE] AI 初稿（${window.moment().format('M月D日 HH:mm')} · 模型 ${this.settings.ai.model}）`,
      `> 来源：${srcLinks} · 人工审定后并入正文，重复起草将覆盖本块。`,
      '',
      out,
      '<!--/jrs-draft-->',
    ].join('\n');

    let updated;
    const existStart = content.indexOf(startMark);
    if (existStart >= 0) {
      const existEnd = content.indexOf('<!--/jrs-draft-->', existStart);
      updated = content.slice(0, existStart) + block + content.slice(existEnd + '<!--/jrs-draft-->'.length);
    } else {
      const head = `## ${sectionName}`;
      const at = content.indexOf(head);
      updated = content.slice(0, at + head.length) + '\n\n' + block + '\n\n' + content.slice(at + head.length).replace(/^\n+/, '');
    }
    await this.app.vault.modify(f, updated);
    await this.smartOpenFile(f);
  }

  /** 期刊 → {abbr, cas, jcr}（基于 cas/jcr 字段，参考值） */
  /** 分词：切出全词集合（比较 abbr 用），如 'operations research letters' → words */
  static venueWords(v) {
    return new Set(String(v).toLowerCase().split(/[^a-z0-9\u4e00-\u9fff+&.-]+/).filter(Boolean));
  }

  zoneOf(venue) {
    if (!venue) return null;
    const v = String(venue).toLowerCase().trim();
    const words = JensenResearchStationPlugin.venueWords(v);
    /* 目标刊：全称精确 或 缩写整词命中（杜绝 'xxejorxx' / 'or' 误配） */
    const j = JOURNALS.find((x) =>
      v === x.abbr.toLowerCase() || v === x.name.toLowerCase() || words.has(x.abbr.toLowerCase()));
    if (j) return { abbr: j.abbr, cas: j.cas, jcr: j.jcr, ccf: j.ccf, tier: j.tier };
    /* 内置库兜底：CCF / 科协（精确名匹配） */
    const ccfHit = JOURNAL_BUILTIN.ccf.find((x) => x[0].toLowerCase() === v || (x[1] && x[1].toLowerCase() === v));
    if (ccfHit) return { abbr: '', cas: '', jcr: '', ccf: ccfHit[2], tier: '' };
    for (const [k, gv] of Object.entries(JOURNAL_BUILTIN.ops)) { if (k.toLowerCase() === v) return { abbr: '', cas: '', jcr: '', ccf: '', tier: gv }; }
    for (const [k, gv] of Object.entries(JOURNAL_BUILTIN.aero)) { if (k.toLowerCase() === v) return { abbr: '', cas: '', jcr: '', ccf: '', tier: gv }; }
    /* 已下载的中科院缓存（精确键） */
    if (this._jcache?.cas?.[v]) return { abbr: '', cas: this._jcache.cas[v][0], jcr: '', ccf: '', tier: '', top: this._jcache.cas[v][1] };
    if (this._jcache?.xr?.[v]) return { abbr: '', cas: '', jcr: '', ccf: '', tier: '', xr: this._jcache.xr[v] };
    return null;
  }

  zoneBadge(zone) {
    if (!zone) return null;
    const el = document.createElement('span');
    el.className = 'jrs-zone-badge';
    const bits = [];
    if (zone.cas) bits.push(`中科院${zone.cas}${zone.top ? '·Top' : ''}`);
    if (zone.xr) bits.push(`新锐${zone.xr}`);
    if (zone.ccf) bits.push(`CCF-${zone.ccf}`);
    if (zone.tier) bits.push(`科协${zone.tier}`);
    if (!bits.length) return null;
    el.textContent = bits.join(' · ');
    el.setAttribute('data-zone', (zone.cas || '').includes('1区') || (zone.ccf || '').startsWith('A') || ['A', 'T1'].includes(zone.tier) ? 'top' : (zone.xr || '') ? 'cn' : 'mid');
    el.title = '分区/分级为参考值，以最新官方表为准';
    return el;
  }

  /* ---------- 期刊分级查询引擎（CCF/科协/中科院2025/新锐2026/预警） ---------- */

  journalCachePath() { return '科研工作台/期刊分区缓存.json'; }

  async loadJournalCache(force = false) {
    if (this._jcache && !force) return this._jcache;
    try {
      const f = this.app.vault.getAbstractFileByPath(this.journalCachePath());
      if (f instanceof TFile) this._jcache = JSON.parse(await this.app.vault.cachedRead(f));
    } catch (e) { this._jcache = null; }
    return this._jcache;
  }

  /** mini CSV 解析（处理双引号包裹与逗号） */
  static parseCsvLine(line) {
    const out = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
      const c = line[i];
      if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i += 1; } else inQ = !inQ; }
      else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  /** 下载中科院2025 + 新锐2026 全量表 → 精简缓存（一次即可，之后离线） */
  async downloadJournalDB() {
    const base = 'https://raw.githubusercontent.com/hitfyd/ShowJCR/master/%E4%B8%AD%E7%A7%91%E9%99%A2%E5%88%86%E5%8C%BA%E8%A1%A8%E5%8F%8AJCR%E5%8E%9F%E5%A7%8B%E6%95%B0%E6%8D%AE%E6%96%87%E4%BB%B6';
    const pull = async (file) => {
      const r = await requestUrl({ url: `${base}/${file}`, method: 'GET', throw: false });
      if (r.status !== 200) throw new Error(`${file} 拉取失败 ${r.status}`);
      return r.text;
    };
    /* 中科院 2025：Journal(0) 大类(8) 大类分区(9) Top(10) */
    const fqbRaw = await pull('FQBJCR2025-UTF8.csv');
    const cas = {};
    fqbRaw.split('\n').slice(1).forEach((line) => {
      if (!line.trim()) return;
      const cols = JensenResearchStationPlugin.parseCsvLine(line);
      const name = (cols[0] || '').trim().toLowerCase();
      const zoneM = (cols[9] || '').match(/^(\d)/);
      if (name && zoneM) cas[name] = [`${zoneM[1]}区`, (cols[10] || '').trim() === '是', (cols[8] || '').trim()];
    });
    /* 新锐 2026：刊名(3) 大类新锐分区(15) */
    const xrRaw = await pull('XR2026-UTF8.csv');
    const xr = {};
    xrRaw.split('\n').slice(1).forEach((line) => {
      if (!line.trim()) return;
      const cols = JensenResearchStationPlugin.parseCsvLine(line);
      const name = (cols[3] || '').trim().toLowerCase();
      const z = (cols[15] || '').replace(' ', '').trim();
      if (name && /^\d区$/.test(z)) xr[name] = z;
    });
    await this.ensureFolder('科研工作台');
    const path = this.journalCachePath();
    const old = this.app.vault.getAbstractFileByPath(path);
    const payload = JSON.stringify({ v: 1, ts: Date.now(), cas, xr });
    if (old instanceof TFile) await this.app.vault.modify(old, payload);
    else await this.app.vault.create(path, payload);
    this._jcache = { v: 1, ts: Date.now(), cas, xr };
    return { cas: Object.keys(cas).length, xr: Object.keys(xr).length };
  }

  /** 万能期刊查询：内置（CCF/科协/预警/目标刊）+ 缓存（中科院2025/新锐2026） */
  async lookupJournal(nameRaw) {
    const name = String(nameRaw || '').trim().toLowerCase();
    if (!name) return { found: false };
    const out = { found: false, query: nameRaw };
    /* 目标刊 17 本 */
    const w1 = JensenResearchStationPlugin.venueWords(nameRaw);
    const j = JOURNALS.find((x) => name === x.abbr.toLowerCase() || name === x.name.toLowerCase() || w1.has(x.abbr.toLowerCase()));
    if (j) {
      out.found = true;
      if (j.cas) out.cas = j.cas;
      if (j.jcr) out.jcr = j.jcr;
      if (j.ccf) out.ccf = { grade: j.ccf, type: 'journal' };
      if (j.tier) out.cast = j.tier;
      out.target = true;
    }
    /* CCF 2026（含会议） */
    const ccfHit = JOURNAL_BUILTIN.ccf.find((x) => {
      const xn = x[0].toLowerCase();
      if (xn === name || (x[1] && x[1].toLowerCase() === name)) return true;
      const xw = xn.split(/\s+/).filter((t) => t.length > 2);
      if (xw.length >= 2 && xw.every((t) => w1.has(t))) {
        const extra = [...w1].filter((t) => t.length > 2 && !xw.includes(t) && !['journal', 'transactions', 'of', 'the', 'on'].includes(t));
        return extra.length === 0;
      }
      return false;
    });
    if (ccfHit) {
      out.found = true;
      out.ccf = { grade: ccfHit[2], type: ccfHit[3] === 'conf' ? '会议' : '期刊', field: ccfHit[4] };
    }
    /* 科协：运筹与管理 + 航空航天 */
    for (const [k, v] of Object.entries(JOURNAL_BUILTIN.ops)) {
      if (k.toLowerCase() === name) { out.found = true; out.cast = v; out.castField = '运筹与管理'; break; }
    }
    if (!out.cast) {
      for (const [k, v] of Object.entries(JOURNAL_BUILTIN.aero)) {
        if (k.toLowerCase() === name) { out.found = true; out.cast = v; out.castField = '航空航天'; break; }
      }
    }
    /* 预警 */
    const warnHit = JOURNAL_BUILTIN.warn.find((x) => x[0].toLowerCase() === name);
    if (warnHit) { out.found = true; out.warn = warnHit[1]; }
    /* 缓存：中科院 2025 + 新锐 2026 */
    const cache = await this.loadJournalCache();
    if (cache?.cas?.[name]) {
      out.found = true;
      out.cas = cache.cas[name][0];
      out.casTop = cache.cas[name][1];
      out.cat = cache.cas[name][2];
    }
    if (cache?.xr?.[name]) { out.found = true; out.xr = cache.xr[name]; }
    return out;
  }

  /* ---------- 问答日志持久化（v0.8） ---------- */

  askLogPath() { return `科研工作台/AI问答/${todayKey()}.md`; }

  async appendAskLog(item) {
    await this.ensureFolder('科研工作台/AI问答');
    const path = this.askLogPath();
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) {
      f = await this.app.vault.create(path, `# AI 问答 ${todayKey()}\n\n`);
    }
    const safeA = item.a.trim().replace(/^### /gm, '#### ').replace(/^来源：/gm, '**来源**：');
    const srcLine = item.sources?.length
      ? `

来源：${item.sources.map((s) => `[[${s.file ? s.file.basename : s.basename}]]`).join('、')}` : '';
    await this.app.vault.append(f, `\n### Q: ${item.q}\n\n${safeA}${srcLine}\n`);
  }

  async getAskLogToday() {
    const f = this.app.vault.getAbstractFileByPath(this.askLogPath());
    if (!(f instanceof TFile)) return [];
    const content = await this.app.vault.cachedRead(f);
    return content.split(/\n(?=### Q: )/).map((block) => {
      const qm = block.match(/^### Q: (.+)$/m);
      if (!qm) return null;
      const q = qm[1].trim();
      const body = block.replace(/^### Q: .+$/m, '').trim();
      const srcMatch = body.match(/^来源：(.+)$/gm);  /* 全局匹配取最后一个 */
      const srcLine = srcMatch ? srcMatch[srcMatch.length - 1] : null;
      const srcText = srcLine ? srcLine.replace(/^来源：/, '') : '';
      const sources = srcText.split(/、/).map((l) => l.replace(/\[\[([^\]|]+).*?\]\]/, '$1').trim()).filter(Boolean)
        .map((basename) => ({ basename, title: basename }));
      const a = body.replace(/^来源：.+$/m, '').trim();
      return { q, a, sources };
    }).filter(Boolean).reverse();
  }

  /* ---------- 编辑器 AI 三连（润色/扩写/精简） ---------- */

  async aiEditSelection(editor, mode) {
    const sel = editor && editor.getSelection ? editor.getSelection() : '';
    if (!sel || !sel.trim()) {
      new Notice('请先选中要处理的段落文字');
      return;
    }
    const spec = {
      polish: ['学术润色', '改写为严谨的学术书面语：术语规范、逻辑连贯、去口语化。保持原意与长度相近，直接输出改写后的文字。'],
      expand: ['扩写深化', '在保持原意的前提下扩写：补充机理说明、对比视角与过渡句，篇幅约为原文 1.5-2 倍。直接输出扩写后的文字。'],
      condense: ['精简提炼', '压缩到原篇幅一半以内，保留全部关键论断与术语，删除冗余修饰。直接输出精简后的文字。'],
    }[mode];
    new Notice(`${spec[0]}处理中…`);
    try {
      const out = await this.aiChat(
        `你是运筹学/航天领域的学术写作助手。任务：${spec[0]}。要求：${spec[1]} 不要任何解释、前后缀或代码块。`,
        sel.slice(0, 3000),
        1600,
 );
      const clean = out.trim().replace(/^```[a-z]*\n?|```$/g, '');
      if (!clean) throw new Error('模型返回为空');
      editor.replaceSelection(clean);
      new Notice(`${spec[0]}完成（Ctrl+Z 可撤销）`);
    } catch (e) {
      new Notice(`${spec[0]}失败：${e.message}`);
    }
  }

  /* ---------- 今日小结（确定性汇总，不耗 AI） ---------- */

  async generateDailyDigest() {
    const key = todayKey();
    const log = (this.settings.pomoLog || {})[key] || {};
    const papers = this.getPapers();
    const addedToday = papers.filter((p) => window.moment(p.added).format('YYYY-MM-DD') === key);
    const questions = await this.getQuestions();
    const subs = this.getSubmissions();
    const lines = [
      `- 专注：${log.count || 0} 个番茄 · ${log.minutes || 0} 分钟`,
      `- 文献：今日新增 ${addedToday.length} 篇；阅读中 ${papers.filter((p) => p.status === '阅读中').length} · 待读 ${papers.filter((p) => p.status === '待读').length}`,
      `- 研究问题：待解答 ${questions.filter((q) => q.status === 'open').length} 个`,
      `- 投稿管线：${subs.filter((s) => ['写作中', '准备投稿'].includes(s.status)).length} 篇在写 · ${subs.filter((s) => ['已投', '审稿中', '大修', '小修'].includes(s.status)).length} 篇在审`,
    ];
    if (addedToday.length) lines.push(`- 新增：${addedToday.slice(0, 5).map((p) => p.title.slice(0, 18) + '…').join('；')}`);
    let f = this.findDailyNote();
    if (!f) {
      try {
        if (this.settings.dailyFolder) await this.ensureFolder(this.settings.dailyFolder);
        const k = key;
        f = await this.app.vault.create(this.dailyPath(), `# ${k}

## 今日待办

## 专注记录
`);
      } catch (e) {
        new Notice(`日记创建失败：${e.message}（检查设置中的日记目录）`);
        return;
      }
    }
    const content = await this.app.vault.cachedRead(f);
    await this.app.vault.modify(f, replaceSection(content, '今日小结', lines.join('\n')));
    new Notice('今日小结已写入日记 ');
    await this.smartOpenFile(f);
  }

  /* ---------- 快速捕获（ima 收藏哲学） ---------- */

  async captureThought(text) {
    await this.ensureFolder(this.settings.inboxFolder);
    const path = `${this.settings.inboxFolder}/${todayKey()}.md`;
    let f = this.app.vault.getAbstractFileByPath(path);
    if (!(f instanceof TFile)) f = await this.app.vault.create(path, `# 收件箱 ${todayKey()}\n\n`);
    const safeT = String(text).replace(/[\r\n]+/g, ' / ').slice(0, 2000);
    await this.app.vault.append(f, `\n- ${window.moment().format('HH:mm')} ${safeT}`);

    return f;
  }

  async getInboxToday() {
    const f = this.app.vault.getAbstractFileByPath(`${this.settings.inboxFolder}/${todayKey()}.md`);
    if (!(f instanceof TFile)) return [];
    const content = await this.app.vault.cachedRead(f);
    return content.split('\n').filter((l) => /^- \d{2}:\d{2} /.test(l.trim())).map((l) => l.trim().replace(/^- \d{2}:\d{2} /, ''));
  }

  /* ---------- 投稿管线 ---------- */

  getSubmissions() {
    const folder = this.settings.submissionsFolder;
    const files = this.app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(folder + '/'));
    return files.map((f) => {
      const fm = (this.app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      return {
        file: f, added: f.stat.ctime,
        title: fm.title || f.basename,
        target: fm.target || '',
        status: SUB_STATUSES.includes(fm.status) ? fm.status : '写作中',
        deadline: fm.deadline || '',
        note: fm.note || '',
      };
    }).sort((a, b) => b.added - a.added);
  }

  async createSubmission(title, target, deadline = '', note = '') {
    await this.ensureFolder(this.settings.submissionsFolder);
    const name = sanitizeFilename(`${title} - ${target}`);
    let path = `${this.settings.submissionsFolder}/${name}.md`;
    if (this.app.vault.getAbstractFileByPath(path)) path = `${this.settings.submissionsFolder}/${name} ${todayKey()}.md`;
    const j = JOURNALS.find((x) => x.abbr === target);
    const content = [
      '---',
      `title: "${title.replace(/"/g, "'")}"`,
      `target: "${String(target).replace(/"/g, "'")}"`,
      'status: 写作中',
      deadline ? `deadline: ${deadline}` : 'deadline: ',
      `created: ${todayKey()}`,
      '---',
      '',
      `# ${title}`,
      '',
      ` 目标期刊：**${target}**${j ? `（${j.name}，${j.tag}）` : ''}`,
      '',
      j ? `> 匹配点：${j.match}。${j.note}。${j.link ? `投稿入口：${j.link}` : ''}` : '',
      '',
      '## 核心贡献（3 条以内）',
      '- ',
      '',
      '## 写作计划',
      '- [ ] 模型与符号表',
      '- [ ] 算法框架图',
      '- [ ] 计算实验与对比基线',
      '- [ ] 引言与文献综述（联动文献矩阵）',
      '- [ ] 全文润色与格式（期刊模板）',
      '',
      '## 审稿意见与回应',
      '',
      note ? `## 备注\n${note}` : '',
    ].filter((x) => x !== undefined).join('\n');
    const f = await this.app.vault.create(path, content);
    return f;
  }

  async cycleSubmission(s) {
    await this.app.fileManager.processFrontMatter(s.file, (fm) => {
      fm.status = SUB_STATUSES[(SUB_STATUSES.indexOf(fm.status) + 1) % SUB_STATUSES.length];
    });
  }

  /* ---------- 论文图谱（Canvas 生成） ---------- */

  graphStats() {
    const papers = this.getPapers();
    const topics = this.settings.topics.filter((t) => papers.some((p) => p.topics.includes(t)));
    const edges = papers.reduce((a, p) => a + p.topics.filter((t) => topics.includes(t)).length, 0);
    return { topics: topics.length, papers: papers.length, edges };
  }

  async generateGraphCanvas(open) {
    const papers = this.getPapers();
    if (!papers.length) { new Notice('文献库为空，已阻止重建（避免清空现有图谱）'); return; }
    const topics = this.settings.topics.filter((t) => papers.some((p) => p.topics.includes(t)));
    const untagged = papers.filter((p) => !p.topics.some((t) => topics.includes(t)));
    const nodes = []; const edges = [];
    /* 主题节点：横向一排居中 */
    const T_W = 260; const T_H = 60; const T_GAP = 60;
    const rowW = topics.length * (T_W + T_GAP) - T_GAP;
    topics.forEach((t, i) => {
      nodes.push({
        id: `topic-${i}`, type: 'text', text: `## ${t}`,
        x: -rowW / 2 + i * (T_W + T_GAP), y: -520, width: T_W, height: T_H, color: '3',
      });
    });
    /* 未分类虚拟节点 */
    if (untagged.length) {
      nodes.push({ id: 'topic-uncategorized', type: 'text', text: '## 未标注方向', x: -rowW / 2 - 340, y: -520, width: T_W, height: T_H, color: '4' });
    }
    /* 论文节点：按主题列向下堆叠 */
    const P_W = 280; const P_H = 80; const P_GAP = 26;
    topics.forEach((t, ti) => {
      const items = papers.filter((p) => p.topics.includes(t));
      items.forEach((p, pi) => {
        const nid = `paper-${ti}-${pi}`;
        nodes.push({
          id: nid, type: 'text',
          text: `[[${p.file.basename}|${p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title}]]\n${p.status}${p.year ? ' · ' + p.year : ''}`,
          x: -rowW / 2 + ti * (T_W + T_GAP) - 10, y: -420 + pi * (P_H + P_GAP),
          width: P_W, height: P_H,
          color: p.status === '已完成' ? '6' : p.status === '阅读中' ? '5' : '0',
        });
        edges.push({ id: `e-${nid}`, fromNode: `topic-${ti}`, fromSide: 'bottom', toNode: nid, toSide: 'top', color: '1' });
      });
    });
    /* 未分类论文节点 */
    untagged.forEach((p, pi) => {
      const nid = `paper-unc-${pi}`;
      nodes.push({
        id: nid, type: 'text',
        text: `[[${p.file.basename}|${p.title.length > 40 ? p.title.slice(0, 40) + '…' : p.title}]]\n${p.status}${p.year ? ' · ' + p.year : ''}`,
        x: -rowW / 2 - 350, y: -420 + pi * (P_H + P_GAP), width: P_W, height: P_H, color: '0',
      });
      edges.push({ id: `e-${nid}`, fromNode: 'topic-uncategorized', fromSide: 'bottom', toNode: nid, toSide: 'top', color: '4' });
    });
    if (!nodes.length) { new Notice('图谱无内容，已取消写入'); return; }
    const canvas = { nodes, edges, fmtMd: true };
    const path = this.settings.graphCanvas;
    const old = this.app.vault.getAbstractFileByPath(path);
    if (old instanceof TFile) await this.app.vault.modify(old, JSON.stringify(canvas, null, 1));
    else { await this.ensureFolder(path.split('/').slice(0, -1).join('/')); await this.app.vault.create(path, JSON.stringify(canvas, null, 1)); }
    new Notice(`图谱已生成：${topics.length} 主题 · 入图 ${papers.length - untagged.length} 篇（未标注 ${untagged.length} 篇归入"未标注方向"）`);
    if (open) await this.openGraphCanvas();
  }

  async openGraphCanvas() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.graphCanvas);
    if (f) await this.smartOpenFile(f);
  }

  /* ---------- Bases ---------- */

  /** 异步确认弹窗（替代 window.confirm 原生阻塞） */
  confirmDialog(title, message) {
    return new Promise((resolve) => {
      const m = new Modal(this.app);
      m.titleEl.setText(title);
      m.contentEl.createEl('p', { text: message });
      new Setting(m.contentEl)
        .addButton((b) => b.setButtonText('确认').setCta().onClick(() => { m.close(); resolve(true); }))
        .addButton((b) => b.setButtonText('取消').onClick(() => { m.close(); resolve(false); }));
      m.onClose = () => resolve(false);
      m.open();
    });
  }

  async generateBases() {
    const dir = this.settings.basesFolder;
    const existing = ['文献库', '阅读队列'].filter((n) => this.app.vault.getAbstractFileByPath(`${dir}/${n}.base`));
    if (existing.length) {
      const ok = await this.confirmDialog('重建 Bases', `将覆盖 ${existing.join('、')} 的 Bases 配置（手工修改会丢失）。`);
      if (!ok) { new Notice('已取消'); return; }
    }
    await this.ensureFolder(dir);
    const mk = async (name, yaml) => {
      const p = `${dir}/${name}.base`;
      const old = this.app.vault.getAbstractFileByPath(p);
      if (old instanceof TFile) await this.app.vault.modify(old, yaml);
      else await this.app.vault.create(p, yaml);
    };
    await mk('文献库', baseFile([`file.inFolder("${this.settings.libFolder}")`], [
      { name: '收件箱（待读）', filters: [`status == "待读"`], order: ['priority', 'file.name', 'authors', 'year'] },
      { name: '阅读中', filters: [`status == "阅读中"`], order: ['file.name', 'reading_progress'] },
      { name: '已完成', filters: [`status == "已完成"`], order: ['rating', 'file.name', 'year'] },
      { name: '全部文献', order: ['file.name', 'authors', 'year', 'status', 'priority', 'rating', 'topics'] },
    ]));
    await mk('阅读队列', baseFile([`file.inFolder("${this.settings.libFolder}")`], [
      { name: '高优先级', filters: [`priority == "高"`, `status != "已归档"`], order: ['status', 'file.name'] },
      { name: '进行中', filters: [`status == "阅读中"`], order: ['file.name'] },
      { name: '近期添加', order: ['added', 'file.name'] },
    ]));
    new Notice(`Bases 已生成 → ${dir}/`);
    const f = this.app.vault.getAbstractFileByPath(`${dir}/文献库.base`);
    if (f) await this.smartOpenFile(f);
  }

  /* ---------- 综述 ---------- */

  surveyExists() { return !!this.app.vault.getAbstractFileByPath(this.settings.surveyNote); }

  async ensureSurveyNote(open) {
    if (this.surveyExists()) { if (open) await this.openSurveyNote(); return; }
    const outline = [
      '# 网格热力驱动的卫星任务规划 · 综述大纲', '',
      '> 用 `- [ ]` 勾选进度，研究进展区段会按 `##` 章节统计完成度。', '',
      '## 1. 引言', '- [ ] 研究背景与意义', '- [ ] 综述范围与文献检索策略', '- [ ] 全文组织结构', '',
      '## 2. 网格切分体系', '- [ ] 全球剖分模型（GeoSOT / H3 / 等经纬度网格）', '- [ ] 时空网格表征与编码', '- [ ] 网格尺度选择与自适应剖分', '',
      '## 3. 网格方法如何辅助规划', '- [ ] 仅用于任务生成：传统范式未变（点目标 → 元任务 → 组合优化）', '- [ ] 网格表征区域目标与覆盖需求', '- [ ] 网格热力驱动的范式演进（热力图 → 规划输入 → 反馈闭环）', '',
      '## 4. 求解算法', '- [ ] 精确算法（分支定界 / 列生成 / MILP）', '- [ ] 元启发式与进化算法（遗传 / 差分进化 / 模因算法）', '- [ ] 深度强化学习方法', '- [ ] 大模型驱动与智能体方法', '',
      '## 5. 问题设定分类', '- [ ] 成像卫星（常规 / 敏捷）', '- [ ] 电磁探测卫星', '- [ ] 巨星座与天临空协同', '',
      '## 6. 实验基准与数据集', '- [ ] 常用测试集与评价指标', '',
      '## 7. 挑战与展望', '- [ ] 开放问题', '- [ ] 未来研究方向', '',
    ].join('\n');
    await this.ensureFolder(this.settings.surveyNote.split('/').slice(0, -1).join('/'));
    const f = await this.app.vault.create(this.settings.surveyNote, outline);
    new Notice('综述大纲已初始化 ');
    if (open) await this.smartOpenFile(f);
  }

  async openSurveyNote() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.surveyNote);
    if (f) await this.smartOpenFile(f);
  }

  async getSurveyProgress() {
    const f = this.app.vault.getAbstractFileByPath(this.settings.surveyNote);
    if (!(f instanceof TFile)) return [];
    const content = await this.app.vault.cachedRead(f);
    const sections = []; let cur = null;
    for (const line of content.split('\n')) {
      const h = line.match(/^## (.+)/);
      if (h) { cur = { name: h[1].trim(), done: 0, total: 0 }; sections.push(cur); continue; }
      const t = line.match(/^(\s*)- \[( |x|X)\] /);
      if (t && cur) { cur.total += 1; if (t[2].toLowerCase() === 'x') cur.done += 1; }
    }
    return sections.filter((s) => s.total > 0);
  }

  /* ---------- 文献矩阵 ---------- */

  async generateMatrix() {
    const papers = this.getPapersSorted('year');
    if (!papers.length) { new Notice('文献库为空'); return; }
    const mdCell = (v) => String(v == null ? '' : v).replace(/\|/g, '\\|');
    const rows = [
      '| 文献 | 年份 | 来源 | 分区 | 方向 | 状态 | 优先级 | 评分 | 问题设定 | 网格作用 | 求解算法 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ];
    for (const p of papers) {
      const t = mdCell(p.title);
      const link = `[[${p.file.basename}|${t.length > 34 ? t.slice(0, 34) + '…' : t}]]`;
      const zone = this.zoneOf(p.venue);
      rows.push(`| ${link} | ${mdCell(p.year || '—')} | ${mdCell(p.venue || '—')} | ${zone ? mdCell(zone.abbr + ' ' + zone.cas) : '—'} | ${mdCell(p.topics.join('、') || '—')} | ${mdCell(p.status)} | ${mdCell(p.priority || '—')} | ${mdCell('★'.repeat(p.rating) || '—')} |  |  |  |`);
    }
    const dir = this.settings.surveyNote.split('/').slice(0, -1).join('/');
    const matrixPath = `${dir ? dir + '/' : ''}文献矩阵.md`;
    const content = [
      '# 文献矩阵', '',
      `> 自动生成于 ${window.moment().format('YYYY-MM-DD HH:mm')} · 共 ${papers.length} 篇。后三列留给精读填写。`, '',
      rows.join('\n'), '',
    ].join('\n');
    const old = this.app.vault.getAbstractFileByPath(matrixPath);
    if (old instanceof TFile) { await this.app.vault.modify(old, content); await this.smartOpenFile(old); }
    else { await this.smartOpenFile(await this.app.vault.create(matrixPath, content)); }
    new Notice(`文献矩阵已生成（${papers.length} 篇）`);
  }
};
