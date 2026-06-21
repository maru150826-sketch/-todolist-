(function () {
  "use strict";

  const DASHBOARD_STORAGE_KEY = "focus_dashboard_v1";
  const ADVICE_STORAGE_KEY = "ai_secretary_advice_v2";
  const PREFERENCES_STORAGE_KEY = "ai_secretary_preferences_v1";
  const TASK_META_STORAGE_KEY = "ai_secretary_task_meta_v1";
  const FEEDBACK_STORAGE_KEY = "ai_secretary_feedback_v1";
  const LOCAL_ONLY = true;
  const CATEGORIES = ["TOEIC", "中国語", "ITパスポート", "大学課題", "筋トレ", "読書", "その他"];
  const MODE_LABELS = {
    advice: "今からの提案",
    review: "今日の振り返り",
    tomorrow: "明日の作戦"
  };

  function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function addDays(dateKey, amount) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + amount);
    return localDateKey(date);
  }

  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || "{}");
      return {
        energy: ["energetic", "normal", "tired"].includes(saved.energy) ? saved.energy : "normal",
        availableMinutes: [10, 25, 45].includes(Number(saved.availableMinutes)) ? Number(saved.availableMinutes) : 25
      };
    } catch (_) {
      return { energy: "normal", availableMinutes: 25 };
    }
  }

  function savePreferences(partial) {
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ ...loadPreferences(), ...partial }));
    } catch (_) {}
  }

  function loadTaskMetadata() {
    try {
      const saved = JSON.parse(localStorage.getItem(TASK_META_STORAGE_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch (_) {
      return {};
    }
  }

  function saveTaskMetadata(taskId, metadata) {
    if (!taskId) return;
    try {
      const all = loadTaskMetadata();
      all[taskId] = {
        estimatedMinutes: Math.max(5, Math.min(180, Number(metadata.estimatedMinutes) || 25)),
        difficulty: ["light", "normal", "hard"].includes(metadata.difficulty) ? metadata.difficulty : "normal",
        energyRequired: ["low", "normal", "high"].includes(metadata.energyRequired) ? metadata.energyRequired : "normal",
        nextStep: String(metadata.nextStep || "").slice(0, 120)
      };
      localStorage.setItem(TASK_META_STORAGE_KEY, JSON.stringify(all));
    } catch (_) {}
  }

  function loadFeedback() {
    try {
      const saved = JSON.parse(localStorage.getItem(FEEDBACK_STORAGE_KEY) || "{}");
      return {
        taskWeights: saved.taskWeights && typeof saved.taskWeights === "object" ? saved.taskWeights : {},
        categoryWeights: saved.categoryWeights && typeof saved.categoryWeights === "object" ? saved.categoryWeights : {},
        history: Array.isArray(saved.history) ? saved.history.slice(-100) : []
      };
    } catch (_) {
      return { taskWeights: {}, categoryWeights: {}, history: [] };
    }
  }

  function recordFeedback(action, task) {
    if (!task || !["accepted", "postponed", "poor"].includes(action)) return;
    const changes = {
      accepted: { task: 4, category: 2 },
      postponed: { task: -4, category: -1 },
      poor: { task: -6, category: -2 }
    }[action];
    try {
      const saved = loadFeedback();
      saved.taskWeights[task.id] = Math.max(-20, Math.min(20, Number(saved.taskWeights[task.id] || 0) + changes.task));
      saved.categoryWeights[task.category] = Math.max(-12, Math.min(12, Number(saved.categoryWeights[task.category] || 0) + changes.category));
      saved.history.push({ action, taskId: task.id, category: task.category, at: new Date().toISOString() });
      localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(saved));
    } catch (_) {}
  }

  function readDashboardState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY) || "{}");
      return {
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        reviews: parsed.reviews && typeof parsed.reviews === "object" ? parsed.reviews : {},
        weeklyGoals: parsed.weeklyGoals && typeof parsed.weeklyGoals === "object" ? parsed.weeklyGoals : {}
      };
    } catch (error) {
      console.warn("AI書記: 保存データを読めなかったため空データを使います。", error);
      return { tasks: [], sessions: [], reviews: {}, weeklyGoals: {} };
    }
  }

  function sumMinutes(sessions) {
    return sessions.reduce((sum, session) => sum + Math.max(0, Number(session.minutes) || 0), 0);
  }

  function sumByCategory(sessions) {
    return sessions.reduce((result, session) => {
      const category = String(session.category || "その他");
      result[category] = (result[category] || 0) + Math.max(0, Number(session.minutes) || 0);
      return result;
    }, {});
  }

  function defaultEstimate(task) {
    const title = String(task.title || "");
    if (/復習|単語|確認|整理|メモ/.test(title)) return 10;
    if (task.category === "筋トレ" || task.category === "大学課題") return 45;
    return 25;
  }

  function compactTask(task, metadataMap = loadTaskMetadata()) {
    const metadata = metadataMap[String(task.id || "")] || {};
    return {
      id: String(task.id || ""),
      title: String(task.title || "無題のタスク").slice(0, 120),
      category: String(task.category || "その他"),
      priority: String(task.priority || "normal"),
      date: task.date || null,
      doTodayDate: task.doTodayDate || null,
      deadline: task.deadline || null,
      done: Boolean(task.done),
      estimatedMinutes: Math.max(5, Math.min(180, Number(metadata.estimatedMinutes || task.estimatedMinutes) || defaultEstimate(task))),
      difficulty: ["light", "normal", "hard"].includes(metadata.difficulty) ? metadata.difficulty : "normal",
      energyRequired: ["low", "normal", "high"].includes(metadata.energyRequired) ? metadata.energyRequired : "normal",
      nextStep: String(metadata.nextStep || "").slice(0, 120)
    };
  }

  function getRecentAndInsufficient(categoryMinutes, weeklyGoals) {
    const frequent = Object.entries(categoryMinutes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, minutes]) => ({ category, minutes }));

    const insufficient = Object.entries(weeklyGoals)
      .filter(([, goal]) => Number(goal) > 0)
      .map(([category, goal]) => {
        const minutes = Number(categoryMinutes[category] || 0);
        return { category, minutes, goal: Number(goal), ratio: minutes / Number(goal) };
      })
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 3)
      .map(({ category, minutes, goal }) => ({ category, minutes, goal }));

    return { frequent, insufficient };
  }

  // 既存データは変更せず、AIに渡す小さな要約だけを作ります。
  function buildAiSecretarySummary() {
    const data = readDashboardState();
    const now = new Date();
    const preferences = loadPreferences();
    const taskMetadata = loadTaskMetadata();
    const today = localDateKey(now);
    const sevenDaysAgo = addDays(today, -6);
    const tomorrow = addDays(today, 1);
    const twoWeeksLater = addDays(today, 14);

    const todaySessions = data.sessions.filter(session => session.date === today);
    const sevenDaySessions = data.sessions.filter(session => session.date >= sevenDaysAgo && session.date <= today);
    const completedToday = data.tasks.filter(task => {
      if (!task.done) return false;
      if (task.completedAt) return localDateKey(new Date(task.completedAt)) === today;
      return task.date === today;
    });
    const incomplete = data.tasks.filter(task => !task.done);
    const actionableIncomplete = incomplete.filter(task =>
      task.date === today
      || task.doTodayDate === today
      || (task.deadline && task.deadline <= today)
    );
    const deadlineIncomplete = incomplete
      .filter(task => task.deadline)
      .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
    const calendarEvents = incomplete
      .filter(task => task.date && task.date >= today && task.date <= twoWeeksLater)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 30)
      .map(task => compactTask(task, taskMetadata));
    const manualLogs = data.sessions
      .filter(session => session.type === "manual")
      .sort((a, b) => String(b.endedAt || b.date).localeCompare(String(a.endedAt || a.date)))
      .slice(0, 20)
      .map(session => ({
        date: session.date,
        title: String(session.taskTitle || "手動ログ").slice(0, 120),
        category: String(session.category || "その他"),
        minutes: Math.max(0, Number(session.minutes) || 0),
        note: String(session.note || "").slice(0, 200)
      }));
    const sevenDayCategoryMinutes = sumByCategory(sevenDaySessions);
    const trends = getRecentAndInsufficient(sevenDayCategoryMinutes, data.weeklyGoals);
    const mainGoals = Object.entries(data.weeklyGoals)
      .filter(([, minutes]) => Number(minutes) > 0)
      .map(([category, minutes]) => ({ category, weeklyTargetMinutes: Number(minutes) }));

    return {
      schemaVersion: 1,
      today,
      currentTime: now.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
      currentHour: now.getHours(),
      userEnergy: preferences.energy,
      availableMinutes: preferences.availableMinutes,
      todayFocusMinutes: sumMinutes(todaySessions),
      todayLastCategory: todaySessions.length ? String(todaySessions[todaySessions.length - 1].category || "その他") : null,
      completedTasksToday: completedToday.slice(0, 30).map(task => compactTask(task, taskMetadata)),
      incompleteTasks: incomplete.slice(0, 50).map(task => compactTask(task, taskMetadata)),
      actionableIncompleteTasks: actionableIncomplete.slice(0, 30).map(task => compactTask(task, taskMetadata)),
      backlogTaskCount: incomplete.length,
      deadlineIncompleteTasks: deadlineIncomplete.slice(0, 30).map(task => compactTask(task, taskMetadata)),
      todayCategoryMinutes: sumByCategory(todaySessions),
      last7DaysCategoryMinutes: sevenDayCategoryMinutes,
      calendarEvents,
      tomorrowTasks: incomplete.filter(task => task.date === tomorrow || task.deadline === tomorrow).slice(0, 20).map(task => compactTask(task, taskMetadata)),
      manualLogs,
      recentFrequentCategories: trends.frequent,
      recentInsufficientCategories: trends.insufficient,
      mainGoals,
      todayReview: String(data.reviews[today] || "").slice(0, 1000)
    };
  }

  function getDeadlineRisk(task, today) {
    if (!task?.deadline) return { level: "none", label: "締切なし", score: 10000 };
    const days = Math.round((new Date(`${task.deadline}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
    if (days < 0) return { level: "danger", label: `${Math.abs(days)}日超過`, score: days };
    if (days === 0) return { level: "danger", label: "今日締切", score: 0 };
    if (days <= 2) return { level: "warning", label: `あと${days}日`, score: days };
    return { level: "safe", label: `あと${days}日`, score: days };
  }

  function daysUntil(dateKey, today) {
    if (!dateKey) return null;
    return Math.round((new Date(`${dateKey}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000);
  }

  function scoreTask(task, summary) {
    const breakdown = [];
    let score = 0;
    const add = (value, label) => {
      if (!value) return;
      score += value;
      breakdown.push({ value, label });
    };

    const dueIn = daysUntil(task.deadline, summary.today);
    if (dueIn !== null) {
      if (dueIn < 0) add(50, `締切を${Math.abs(dueIn)}日超過`);
      else if (dueIn === 0) add(45, "今日が締切");
      else if (dueIn === 1) add(38, "締切まで1日");
      else if (dueIn <= 3) add(30, `締切まで${dueIn}日`);
      else if (dueIn <= 7) add(20, `締切まで${dueIn}日`);
      else if (dueIn <= 14) add(10, `締切まで${dueIn}日`);
    }

    add({ high: 20, normal: 10, low: 3 }[task.priority] ?? 10, task.priority === "high" ? "重要度が高い" : "重要度を反映");
    if (task.date === summary.today || task.doTodayDate === summary.today) add(15, "今日やる指定");
    else if (!task.deadline) add(-8, "今日指定・締切なし");

    const shortageIndex = (summary.recentInsufficientCategories || []).findIndex(item => item.category === task.category);
    if (shortageIndex >= 0) add([15, 10, 5][shortageIndex], `${task.category}が最近不足`);

    const available = Number(summary.availableMinutes || 25);
    const estimate = Number(task.estimatedMinutes || 25);
    if (estimate <= available) add(15, `${available}分以内で進めやすい`);
    else add(-Math.min(18, Math.ceil((estimate - available) / 5) * 3), `見積${estimate}分で時間超過`);

    if (summary.userEnergy === "tired") {
      if (task.energyRequired === "low" || task.difficulty === "light") add(10, "疲れていても着手しやすい");
      if (task.energyRequired === "high" || task.difficulty === "hard") add(-18, "今の体力には重い");
    } else if (summary.userEnergy === "energetic" && (task.energyRequired === "high" || task.difficulty === "hard")) {
      add(7, "元気な時に進めたい内容");
    }

    if (summary.todayLastCategory && summary.todayLastCategory === task.category && dueIn !== null && dueIn > 3) {
      add(-10, "直前と同じ分野");
    }

    const feedback = loadFeedback();
    const learned = Number(feedback.taskWeights[task.id] || 0) + Number(feedback.categoryWeights[task.category] || 0);
    if (learned) add(learned, learned > 0 ? "過去に採用した傾向" : "過去に見送った傾向");

    return {
      task,
      score: Math.round(score),
      breakdown: breakdown.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    };
  }

  function rankedTasks(summary) {
    return [...(summary.incompleteTasks || [])]
      .map(task => scoreTask(task, summary))
      .sort((a, b) => b.score - a.score || String(a.task.title).localeCompare(String(b.task.title), "ja"));
  }

  function sortedActionableTasks(summary) {
    return rankedTasks(summary).map(result => ({
      ...result.task,
      recommendationScore: result.score,
      scoreBreakdown: result.breakdown
    }));
  }

  function priorityTask(summary) {
    return sortedActionableTasks(summary)[0] || null;
  }

  function recommendationSet(summary) {
    const ranked = sortedActionableTasks(summary);
    const available = Number(summary.availableMinutes || 25);
    const primary = ranked[0] || null;
    const quick = ranked
      .filter(task => task.id !== primary?.id && Number(task.estimatedMinutes || 25) <= available)
      .sort((a, b) => Number(a.estimatedMinutes || 25) - Number(b.estimatedMinutes || 25) || b.recommendationScore - a.recommendationScore)[0]
      || ranked.find(task => task.id !== primary?.id)
      || null;
    const insufficientCategories = new Set((summary.recentInsufficientCategories || []).map(item => item.category));
    const balance = ranked.find(task => task.id !== primary?.id && task.id !== quick?.id && insufficientCategories.has(task.category))
      || ranked.find(task => task.id !== primary?.id && task.id !== quick?.id)
      || null;
    return [
      { type: "priority", label: "最優先", task: primary },
      { type: "quick", label: "短時間", task: quick },
      { type: "balance", label: "不足分野", task: balance }
    ].filter(item => item.task);
  }

  function createBaseLocalAdvice(summary, mode = "advice") {
    const total = Number(summary.todayFocusMinutes || 0);
    const hour = Number(summary.currentHour || 0);
    const incompleteCount = (summary.actionableIncompleteTasks || []).length;
    const task = priorityTask(summary);
    const lowCategory = summary.recentInsufficientCategories?.[0]?.category;
    const topCategory = summary.recentFrequentCategories?.[0]?.category;

    if (mode === "review") {
      if (total === 0) {
        return {
          summary: "今日はまだ集中記録がありません。できなかった理由を責めず、明日の最初の一歩だけ決めましょう。",
          nextAction: "明日の最初のタスクを1つ決める",
          reason: incompleteCount ? `未完了が${incompleteCount}件あるため、全部ではなく開始点だけ固定します。` : "予定が空なので、先に小さな行動を登録すると始めやすくなります。",
          timeEstimate: "5分",
          skip: "今日の遅れを取り戻すための無理な夜更かし",
          tomorrow: task ? task.title : "10分で終わる軽いタスク",
          tone: "light",
          encouragement: "記録がない日も、明日の入口を作れば前進です。"
        };
      }
      return {
        summary: `今日は${total}分集中しました。${topCategory ? `${topCategory}が最も進んでいます。` : "記録を残せています。"}`,
        nextAction: "今日できたことを1行だけ残す",
        reason: "成果を短く言葉にすると、次回の再開地点が明確になります。",
        timeEstimate: "3分",
        skip: "新しい重い課題への着手",
        tomorrow: task ? task.title : "次の優先タスクを決める",
        tone: "normal",
        encouragement: `${total}分は確かな積み上げです。今日はここで区切って構いません。`
      };
    }

    if (mode === "tomorrow") {
      const tomorrowTask = summary.tomorrowTasks?.[0] || task;
      return {
        summary: summary.tomorrowTasks?.length ? `明日の予定は${summary.tomorrowTasks.length}件あります。最初の1件だけ固定します。` : "明日の予定は詰まりすぎていません。開始する内容を今決めておきましょう。",
        nextAction: tomorrowTask ? `明日は「${tomorrowTask.title}」から始める` : `明日は${lowCategory || "主要目標"}を10分だけ始める`,
        reason: tomorrowTask?.deadline ? `締切が${tomorrowTask.deadline}に設定されています。` : "開始時の判断を減らすと、着手しやすくなります。",
        timeEstimate: tomorrowTask?.priority === "high" ? "25分" : "10分",
        skip: "朝から複数タスクを同時に進めること",
        tomorrow: lowCategory && lowCategory !== tomorrowTask?.category ? `${lowCategory}は余力があれば10分` : "終わった後に次を決める",
        tone: "normal",
        encouragement: "明日の最初の一手が決まれば、今日は十分です。"
      };
    }

    if (hour >= 22) {
      return {
        summary: "もう遅い時間です。重い学習を増やすより、明日の再開を簡単にしましょう。",
        nextAction: task ? `「${task.title}」の開始準備だけする` : "明日のタスクを1つ登録する",
        reason: "睡眠を削るより、教材や画面を準備して明日の判断を減らす方が現実的です。",
        timeEstimate: "5分",
        skip: "25分以上の新規学習",
        tomorrow: task ? task.title : lowCategory ? `${lowCategory}を10分` : "最重要タスクを10分",
        tone: "light",
        encouragement: "今日は準備で終えて大丈夫です。"
      };
    }

    if (total === 0) {
      return {
        summary: "今日はまだ始まっていません。最初から完璧な1セットは必要ありません。",
        nextAction: task ? `「${task.title}」を開いて10分だけ進める` : `${lowCategory || "最重要分野"}を10分だけ始める`,
        reason: task ? `${task.priority === "high" ? "優先度が高い" : "現在の未完了タスクの先頭にある"}ためです。` : "開始の負担を小さくして、まず記録を1つ作ります。",
        timeEstimate: "10分",
        skip: "複数の教材やタスクを比較し続けること",
        tomorrow: "今日10分やった結果を見て決める",
        tone: "light",
        encouragement: "10分で止めても成功です。まず始めましょう。"
      };
    }

    if (incompleteCount >= 5) {
      return {
        summary: `未完了が${incompleteCount}件あります。今は追加で頑張るより、選択肢を減らす段階です。`,
        nextAction: task ? `今日やるものを「${task.title}」を含む3つ以内に絞る` : "未完了タスクを3つ以内に絞る",
        reason: "候補が多い状態では、集中力より判断力を消耗しやすいためです。",
        timeEstimate: "5分",
        skip: "新しいタスクの追加",
        tomorrow: "今日選ばなかったタスク",
        tone: "normal",
        encouragement: "全部やる必要はありません。今日は1つ終われば十分です。"
      };
    }

    if (total < 30) {
      return {
        summary: `今日は${total}分進んでいます。次は最重要タスクを1つだけ進めましょう。`,
        nextAction: task ? `「${task.title}」を20分進める` : `${lowCategory || "不足カテゴリ"}を20分進める`,
        reason: task ? "未完了の中で優先度と締切を先に確認した結果です。" : "直近7日間の学習バランスを整えるためです。",
        timeEstimate: "20分",
        skip: "低優先度タスクのつまみ食い",
        tomorrow: "残った軽い整理作業",
        tone: "normal",
        encouragement: "次の20分だけに集中してください。"
      };
    }

    if (total >= 90) {
      return {
        summary: `今日はすでに${total}分集中しています。新しい重い内容より、定着と整理を優先できます。`,
        nextAction: topCategory ? `${topCategory}の復習かメモ整理をする` : "今日の内容を短く復習する",
        reason: "十分な集中量があるため、追加負荷より再開しやすい状態を残す方が有効です。",
        timeEstimate: "10分",
        skip: "新しい大きな課題",
        tomorrow: task ? task.title : lowCategory ? `${lowCategory}を最初に行う` : "次の主要タスク",
        tone: "light",
        encouragement: "今日はかなり進んでいます。きれいに終える時間です。"
      };
    }

    return {
      summary: `今日は${total}分集中しています。もう1つだけ明確なタスクを終わらせましょう。`,
      nextAction: task ? `「${task.title}」を1セット進める` : `${lowCategory || "主要目標"}を1セット進める`,
      reason: task ? "未完了タスクの優先度と日付を確認した結果です。" : "直近7日で不足している分野を補うためです。",
      timeEstimate: "25分",
      skip: "同時進行と途中のタスク切替",
      tomorrow: "今日のセット後に残った内容",
      tone: "normal",
      encouragement: "1セット終えたら、続けるかはその時に決めましょう。"
    };
  }

  function createSmartLocalAdvice(summary, preferredTaskId = null) {
    const recommendations = recommendationSet(summary);
    const preferredTask = preferredTaskId
      ? sortedActionableTasks(summary).find(candidate => candidate.id === preferredTaskId)
      : null;
    const task = preferredTask || recommendations[0]?.task || null;
    const available = Number(summary.availableMinutes || 25);
    const total = Number(summary.todayFocusMinutes || 0);
    const hour = Number(summary.currentHour || 0);

    if (!task) {
      return {
        summary: "提案できる未完了タスクがありません。新しく増やす前に、今日の目的を1つだけ決めましょう。",
        nextAction: "今日やることを1つ登録する",
        reason: "候補になる未完了タスクがないためです。",
        timeEstimate: "5分",
        skip: "目的のないタスク追加",
        tomorrow: "今日登録した最初のタスク",
        tone: "light",
        encouragement: "やることを1つ決めれば十分な前進です。",
        taskId: null,
        score: 0,
        scoreBreakdown: []
      };
    }

    let minutes = Math.min(available, Number(task.estimatedMinutes || available));
    if (summary.userEnergy === "tired") minutes = Math.min(minutes, 10);
    if (hour >= 22 || total >= 90) minutes = Math.min(minutes, 10);
    minutes = Math.max(5, minutes);

    const positives = (task.scoreBreakdown || []).filter(item => item.value > 0).slice(0, 3);
    const reason = positives.length
      ? `${positives.map(item => item.label).join("・")}を点数化した結果、現在の最上位です。`
      : "現在のタスク、使える時間、体力を合わせて比較した結果です。";
    const nextStep = task.nextStep ? `「${task.title}」で、${task.nextStep}` : `「${task.title}」を進める`;
    const second = recommendations.find(item => item.task.id !== task.id)?.task;
    const lowRanked = sortedActionableTasks(summary).slice(-1)[0];

    return {
      summary: `今日は${total}分集中済みです。${summary.incompleteTasks.length}件を比較し、今の条件に最も合う1件を選びました。`,
      nextAction: nextStep,
      reason,
      timeEstimate: `${minutes}分`,
      skip: lowRanked && lowRanked.id !== task.id ? `今は「${lowRanked.title}」を優先しなくてよい` : "新しいタスクを増やすこと",
      tomorrow: second ? second.title : "今回の結果を見てから決める",
      tone: summary.userEnergy === "tired" || total >= 90 ? "light" : summary.userEnergy === "energetic" ? "push" : "normal",
      encouragement: `推薦スコア${task.recommendationScore}点。まず${minutes}分だけ試し、合わなければ提案を調整できます。`,
      taskId: task.id,
      score: task.recommendationScore,
      scoreBreakdown: task.scoreBreakdown || []
    };
  }

  function createLocalAdvice(summary, mode = "advice") {
    if (mode === "advice") return createSmartLocalAdvice(summary);
    const advice = createBaseLocalAdvice(summary, mode);
    const energy = summary.userEnergy || "normal";
    const currentMinutes = Number(String(advice.timeEstimate).match(/\d+/)?.[0] || 0);
    if (mode !== "advice" || currentMinutes < 10) return advice;

    if (energy === "tired" && currentMinutes > 10) {
      advice.timeEstimate = "10分";
      advice.nextAction = advice.nextAction.replace(/\d+分/, "10分").replace("1セット", "10分");
      advice.tone = "light";
      advice.encouragement = "今日は10分で十分です。終わったら休む判断も正解です。";
    } else if (energy === "energetic" && summary.currentHour < 22 && currentMinutes < 25) {
      advice.timeEstimate = "25分";
      advice.nextAction = advice.nextAction.replace(/\d+分/, "25分");
      advice.tone = "push";
      advice.encouragement = "余力があるので、今日は25分をきれいに取り切りましょう。";
    }
    return advice;
  }

  function sanitizeAdvice(value, fallback) {
    const source = value && typeof value === "object" ? value : {};
    const clean = {};
    ["summary", "nextAction", "reason", "timeEstimate", "skip", "tomorrow", "tone", "encouragement"].forEach(key => {
      clean[key] = String(source[key] || fallback[key] || "").slice(0, key === "reason" ? 400 : 240);
    });
    return clean;
  }

  function getRemoteConfig() {
    const config = window.AI_SECRETARY_CONFIG || {};
    try {
      if (!config.supabaseUrl && typeof SUPABASE_URL === "string") config.supabaseUrl = SUPABASE_URL;
      if (!config.supabaseAnonKey && typeof SUPABASE_KEY === "string") config.supabaseAnonKey = SUPABASE_KEY;
    } catch (_) {}
    return config;
  }

  async function requestAiAdvice(summary, mode) {
    const config = getRemoteConfig();
    if (!config.supabaseUrl || !config.supabaseAnonKey) throw new Error("Supabase設定がありません");
    const url = `${String(config.supabaseUrl).replace(/\/$/, "")}/functions/v1/ai-secretary`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`
      },
      body: JSON.stringify({ mode, summary })
    });
    if (!response.ok) throw new Error(`AI書記 API ${response.status}`);
    const body = await response.json();
    return body.advice || body;
  }

  let currentAdvice = null;
  let currentSummary = null;
  let currentMode = "advice";
  let currentSuggestedTask = null;

  function createCard() {
    const card = document.createElement("details");
    card.className = "ai-secretary-card";
    card.id = "aiSecretaryCard";
    card.open = true;
    card.innerHTML = `
      <summary class="ai-secretary-summary">
        <span class="ai-secretary-mark" aria-hidden="true">書</span>
        <span class="ai-secretary-heading"><strong>AI書記</strong><small>次の一手だけを整理します</small></span>
        <span class="ai-secretary-source" id="aiSecretarySource">ローカル提案</span>
        <span class="ai-secretary-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div class="ai-secretary-body">
        <p class="ai-secretary-one-line" id="aiSecretarySummary"></p>
        <div class="ai-secretary-energy" aria-label="現在の体力">
          <span>今日の体力</span>
          <div>
            <button type="button" data-ai-energy="energetic">元気</button>
            <button type="button" data-ai-energy="normal">普通</button>
            <button type="button" data-ai-energy="tired">疲れた</button>
          </div>
        </div>
        <div class="ai-secretary-availability" aria-label="今使える時間">
          <span>今使える時間</span>
          <div>
            <button type="button" data-ai-minutes="10">10分</button>
            <button type="button" data-ai-minutes="25">25分</button>
            <button type="button" data-ai-minutes="45">45分</button>
          </div>
        </div>
        <div class="ai-secretary-focus">
          <span class="ai-secretary-label">NEXT ACTION</span>
          <div class="ai-secretary-action-row"><strong id="aiSecretaryNext"></strong><span class="ai-secretary-time" id="aiSecretaryTime"></span></div>
          <p class="ai-secretary-reason" id="aiSecretaryReason"></p>
          <details class="ai-secretary-score">
            <summary>選定理由の点数 <strong id="aiSecretaryScore"></strong></summary>
            <div id="aiSecretaryScoreBreakdown"></div>
          </details>
        </div>
        <button class="ai-secretary-start" id="aiSecretaryStartBtn" type="button">この提案で開始</button>
        <section class="ai-secretary-candidates" aria-labelledby="aiSecretaryCandidateTitle">
          <div class="ai-secretary-priority-head"><strong id="aiSecretaryCandidateTitle">別の候補</strong><span>タップで切替</span></div>
          <div id="aiSecretaryCandidateList"></div>
        </section>
        <section class="ai-secretary-priorities" aria-labelledby="aiSecretaryPriorityTitle">
          <div class="ai-secretary-priority-head"><strong id="aiSecretaryPriorityTitle">今日の3つ</strong><span>締切リスク</span></div>
          <div id="aiSecretaryPriorityList"></div>
        </section>
        <div class="ai-secretary-grid">
          <div class="ai-secretary-mini"><span>今はやらなくていい</span><p id="aiSecretarySkip"></p></div>
          <div class="ai-secretary-mini"><span>明日に回していい</span><p id="aiSecretaryTomorrow"></p></div>
        </div>
        <p class="ai-secretary-encouragement" id="aiSecretaryEncouragement"></p>
        <div class="ai-secretary-feedback" aria-label="提案の評価">
          <span>この提案はどうでしたか？</span>
          <div>
            <button type="button" data-ai-feedback="accepted">採用</button>
            <button type="button" data-ai-feedback="postponed">後回し</button>
            <button type="button" data-ai-feedback="poor">微妙</button>
          </div>
        </div>
        <details class="ai-secretary-profile" id="aiSecretaryProfile">
          <summary>提案の精度設定 <span id="aiSecretaryProfileTask"></span></summary>
          <div class="ai-secretary-profile-grid">
            <label>予想時間<select id="aiTaskEstimate"><option value="10">10分</option><option value="25">25分</option><option value="45">45分</option><option value="60">60分</option></select></label>
            <label>難しさ<select id="aiTaskDifficulty"><option value="light">軽い</option><option value="normal">普通</option><option value="hard">重い</option></select></label>
            <label>必要な体力<select id="aiTaskEnergy"><option value="low">少ない</option><option value="normal">普通</option><option value="high">多い</option></select></label>
            <label class="wide">次の具体的な一手<input id="aiTaskNextStep" maxlength="120" placeholder="例：問題集の第3章を開く" /></label>
          </div>
          <button type="button" class="ai-secretary-save-profile" id="aiSecretarySaveProfile">このタスク設定を保存</button>
        </details>
        <div class="ai-secretary-actions">
          <button type="button" data-ai-secretary-mode="advice">ローカル書記に聞く</button>
          <button type="button" data-ai-secretary-mode="review">今日の振り返り</button>
          <button type="button" data-ai-secretary-mode="tomorrow">明日の作戦</button>
        </div>
        <div class="ai-secretary-status" id="aiSecretaryStatus" aria-live="polite"></div>
      </div>`;
    return card;
  }

  function renderEnergy(energy) {
    document.querySelectorAll("[data-ai-energy]").forEach(button => {
      const active = button.dataset.aiEnergy === energy;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderAvailableMinutes(minutes) {
    document.querySelectorAll("[data-ai-minutes]").forEach(button => {
      const active = Number(button.dataset.aiMinutes) === Number(minutes);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function renderScore(advice) {
    const score = document.getElementById("aiSecretaryScore");
    const list = document.getElementById("aiSecretaryScoreBreakdown");
    if (score) score.textContent = `${Number(advice.score || 0)}点`;
    if (!list) return;
    list.innerHTML = "";
    const rows = Array.isArray(advice.scoreBreakdown) ? advice.scoreBreakdown.slice(0, 7) : [];
    if (!rows.length) {
      list.textContent = "振り返り・明日の作戦では点数比較を行いません。";
      return;
    }
    rows.forEach(row => {
      const item = document.createElement("div");
      const label = document.createElement("span");
      const value = document.createElement("strong");
      label.textContent = row.label;
      value.textContent = `${row.value > 0 ? "+" : ""}${row.value}`;
      value.className = row.value >= 0 ? "positive" : "negative";
      item.append(label, value);
      list.appendChild(item);
    });
  }

  function renderCandidates(summary) {
    const list = document.getElementById("aiSecretaryCandidateList");
    if (!list) return;
    list.innerHTML = "";
    const candidates = recommendationSet(summary);
    if (!candidates.length) {
      list.textContent = "候補になる未完了タスクはありません。";
      return;
    }
    candidates.forEach(candidate => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.aiCandidate = candidate.task.id;
      button.className = candidate.task.id === currentSuggestedTask?.id ? "active" : "";
      const type = document.createElement("span");
      const title = document.createElement("strong");
      const meta = document.createElement("small");
      type.textContent = candidate.label;
      title.textContent = candidate.task.title;
      meta.textContent = `${candidate.task.recommendationScore}点・見積${candidate.task.estimatedMinutes}分`;
      button.append(type, title, meta);
      list.appendChild(button);
    });
  }

  function renderTaskProfile(task) {
    const details = document.getElementById("aiSecretaryProfile");
    const title = document.getElementById("aiSecretaryProfileTask");
    if (!details) return;
    details.classList.toggle("disabled", !task);
    if (title) title.textContent = task ? task.title : "タスクなし";
    const estimate = document.getElementById("aiTaskEstimate");
    const difficulty = document.getElementById("aiTaskDifficulty");
    const energy = document.getElementById("aiTaskEnergy");
    const nextStep = document.getElementById("aiTaskNextStep");
    if (!task) return;
    if (estimate) {
      const supported = [10, 25, 45, 60];
      estimate.value = String(supported.includes(Number(task.estimatedMinutes)) ? Number(task.estimatedMinutes) : 25);
    }
    if (difficulty) difficulty.value = task.difficulty || "normal";
    if (energy) energy.value = task.energyRequired || "normal";
    if (nextStep) nextStep.value = task.nextStep || "";
  }

  function renderPriorities(summary) {
    const list = document.getElementById("aiSecretaryPriorityList");
    if (!list) return;
    const labels = ["必須", "できれば", "余力があれば"];
    const tasks = sortedActionableTasks(summary).slice(0, 3);
    if (!tasks.length) {
      list.innerHTML = '<p class="ai-secretary-empty">今日対象の未完了タスクはありません。</p>';
      return;
    }
    list.innerHTML = tasks.map((task, index) => {
      const risk = getDeadlineRisk(task, summary.today);
      return `<div class="ai-secretary-priority-item">
        <span class="ai-secretary-rank">${labels[index]}</span>
        <span class="ai-secretary-task-name"></span>
        <span class="ai-secretary-risk ${risk.level}">${risk.label}</span>
      </div>`;
    }).join("");
    list.querySelectorAll(".ai-secretary-task-name").forEach((element, index) => {
      element.textContent = tasks[index].title;
    });
  }

  function resolveSuggestedTask(advice, summary) {
    const tasks = sortedActionableTasks(summary);
    if (advice?.taskId) {
      const exact = tasks.find(task => task.id === advice.taskId);
      if (exact) return exact;
    }
    const text = String(advice?.nextAction || "");
    return tasks.find(task => text.includes(task.title)) || tasks[0] || null;
  }

  function adviceMinutes(advice) {
    const minutes = Number(String(advice?.timeEstimate || "").match(/\d+/)?.[0] || 25);
    return Math.max(1, Math.min(180, minutes));
  }

  function updateStartButton(advice, summary, mode) {
    const button = document.getElementById("aiSecretaryStartBtn");
    if (!button) return;
    currentSuggestedTask = resolveSuggestedTask(advice, summary);
    const available = mode === "advice" && currentSuggestedTask;
    button.hidden = mode !== "advice";
    button.disabled = !available;
    button.textContent = available
      ? `「${currentSuggestedTask.title}」で${adviceMinutes(advice)}分開始`
      : "開始できる今日のタスクがありません";
  }

  function startSuggestedTask() {
    if (!currentSuggestedTask || !currentAdvice) return;
    if (document.body.classList.contains("focus-mode")) {
      alert("集中タイマーがすでに動いています。停止してから切り替えてください。");
      return;
    }
    const minutes = adviceMinutes(currentAdvice);
    const confirmed = confirm(`「${currentSuggestedTask.title}」を選び、${minutes}分の集中を開始しますか？`);
    if (!confirmed) return;
    recordFeedback("accepted", currentSuggestedTask);
    if (typeof window.startTaskToday === "function") window.startTaskToday(currentSuggestedTask.id);
    else if (typeof window.setCurrentTask === "function") window.setCurrentTask(currentSuggestedTask.id);
    if (typeof window.launchFocus === "function") window.launchFocus(minutes);
  }

  function setEnergy(energy) {
    if (!["energetic", "normal", "tired"].includes(energy)) return;
    savePreferences({ energy });
    const summary = buildAiSecretarySummary();
    const advice = createLocalAdvice(summary, currentMode);
    renderAdvice(advice, "体力反映", currentMode, summary);
    saveAdvice(advice, "体力反映", currentMode);
  }

  function setAvailableMinutes(minutes) {
    const value = Number(minutes);
    if (![10, 25, 45].includes(value)) return;
    savePreferences({ availableMinutes: value });
    const summary = buildAiSecretarySummary();
    const advice = createLocalAdvice(summary, currentMode);
    renderAdvice(advice, "時間反映", currentMode, summary);
    saveAdvice(advice, "時間反映", currentMode);
  }

  function selectCandidate(taskId) {
    const summary = buildAiSecretarySummary();
    const advice = createSmartLocalAdvice(summary, taskId);
    renderAdvice(advice, "候補切替", "advice", summary);
    saveAdvice(advice, "候補切替", "advice");
  }

  function applySuggestionFeedback(action) {
    if (!currentSuggestedTask) return;
    recordFeedback(action, currentSuggestedTask);
    const labels = { accepted: "採用を学習", postponed: "後回しを学習", poor: "微妙を学習" };
    const summary = buildAiSecretarySummary();
    const advice = createLocalAdvice(summary, "advice");
    renderAdvice(advice, labels[action] || "学習反映", "advice", summary);
    saveAdvice(advice, labels[action] || "学習反映", "advice");
  }

  function saveCurrentTaskProfile() {
    if (!currentSuggestedTask) return;
    saveTaskMetadata(currentSuggestedTask.id, {
      estimatedMinutes: document.getElementById("aiTaskEstimate")?.value,
      difficulty: document.getElementById("aiTaskDifficulty")?.value,
      energyRequired: document.getElementById("aiTaskEnergy")?.value,
      nextStep: document.getElementById("aiTaskNextStep")?.value
    });
    const summary = buildAiSecretarySummary();
    const advice = createLocalAdvice(summary, "advice");
    renderAdvice(advice, "設定反映", "advice", summary);
    saveAdvice(advice, "設定反映", "advice");
    document.getElementById("aiSecretaryProfile")?.removeAttribute("open");
  }

  function renderAdvice(advice, source, mode, summary = buildAiSecretarySummary()) {
    currentAdvice = advice;
    currentSummary = summary;
    currentMode = mode;
    const ids = {
      aiSecretarySummary: advice.summary,
      aiSecretaryNext: advice.nextAction,
      aiSecretaryReason: advice.reason,
      aiSecretaryTime: advice.timeEstimate,
      aiSecretarySkip: advice.skip,
      aiSecretaryTomorrow: advice.tomorrow,
      aiSecretaryEncouragement: advice.encouragement
    };
    Object.entries(ids).forEach(([id, text]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    });
    const sourceElement = document.getElementById("aiSecretarySource");
    if (sourceElement) sourceElement.textContent = source;
    const status = document.getElementById("aiSecretaryStatus");
    if (status) status.textContent = `${MODE_LABELS[mode] || MODE_LABELS.advice}・${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
    renderEnergy(summary.userEnergy || "normal");
    renderAvailableMinutes(summary.availableMinutes || 25);
    renderPriorities(summary);
    updateStartButton(advice, summary, mode);
    renderScore(advice);
    renderCandidates(summary);
    renderTaskProfile(currentSuggestedTask);
  }

  function saveAdvice(advice, source, mode) {
    try {
      localStorage.setItem(ADVICE_STORAGE_KEY, JSON.stringify({ advice, source, mode, savedAt: new Date().toISOString() }));
    } catch (_) {}
  }

  async function handleRequest(mode) {
    const card = document.getElementById("aiSecretaryCard");
    const buttons = card ? Array.from(card.querySelectorAll("button")) : [];
    const status = document.getElementById("aiSecretaryStatus");
    const summary = buildAiSecretarySummary();
    const fallback = createLocalAdvice(summary, mode);
    card?.classList.add("is-loading");
    buttons.forEach(button => { button.disabled = true; });
    if (status) status.textContent = "既存データを整理しています…";

    let advice = fallback;
    let source = "ローカル提案";
    if (!LOCAL_ONLY) {
      try {
        const remote = await requestAiAdvice(summary, mode);
        advice = sanitizeAdvice(remote, fallback);
        source = "AI提案";
      } catch (error) {
        console.info("AI書記: API未接続または失敗のためローカル提案を表示します。", error);
      }
    }
    card?.classList.remove("is-loading");
    buttons.forEach(button => { button.disabled = false; });
    renderAdvice(advice, source, mode, summary);
    saveAdvice(advice, source, mode);
  }

  function initializeAiSecretary() {
    const aside = document.querySelector("#dashboardView > aside");
    if (!aside || document.getElementById("aiSecretaryCard")) return;
    const card = createCard();
    const firstPanel = aside.firstElementChild;
    if (firstPanel) firstPanel.insertAdjacentElement("afterend", card);
    else aside.appendChild(card);

    let initial = null;
    try { initial = JSON.parse(localStorage.getItem(ADVICE_STORAGE_KEY) || "null"); } catch (_) {}
    if (initial?.advice && !LOCAL_ONLY) {
      const summary = buildAiSecretarySummary();
      renderAdvice(initial.advice, initial.source || "保存済み", initial.mode || "advice", summary);
    } else {
      const summary = buildAiSecretarySummary();
      renderAdvice(createLocalAdvice(summary, "advice"), "ローカル提案", "advice", summary);
    }

    card.querySelectorAll("[data-ai-secretary-mode]").forEach(button => {
      button.addEventListener("click", () => handleRequest(button.dataset.aiSecretaryMode || "advice"));
    });
    card.querySelectorAll("[data-ai-energy]").forEach(button => {
      button.addEventListener("click", () => setEnergy(button.dataset.aiEnergy || "normal"));
    });
    card.querySelectorAll("[data-ai-minutes]").forEach(button => {
      button.addEventListener("click", () => setAvailableMinutes(button.dataset.aiMinutes));
    });
    card.querySelectorAll("[data-ai-feedback]").forEach(button => {
      button.addEventListener("click", () => applySuggestionFeedback(button.dataset.aiFeedback));
    });
    document.getElementById("aiSecretaryCandidateList")?.addEventListener("click", event => {
      const button = event.target.closest("[data-ai-candidate]");
      if (button) selectCandidate(button.dataset.aiCandidate);
    });
    document.getElementById("aiSecretarySaveProfile")?.addEventListener("click", saveCurrentTaskProfile);
    document.getElementById("aiSecretaryStartBtn")?.addEventListener("click", startSuggestedTask);
  }

  window.AiSecretary = {
    buildSummary: buildAiSecretarySummary,
    createLocalAdvice,
    ask: handleRequest,
    getTopTasks: summary => sortedActionableTasks(summary).slice(0, 3),
    scoreTask,
    getRecommendations: recommendationSet,
    saveTaskMetadata,
    recordFeedback,
    getDeadlineRisk,
    startSuggestion: startSuggestedTask
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeAiSecretary);
  else initializeAiSecretary();
})();
