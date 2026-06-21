(function () {
  "use strict";

  const DASHBOARD_STORAGE_KEY = "focus_dashboard_v1";
  const ADVICE_STORAGE_KEY = "ai_secretary_advice_v1";
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

  function compactTask(task) {
    return {
      id: String(task.id || ""),
      title: String(task.title || "無題のタスク").slice(0, 120),
      category: String(task.category || "その他"),
      priority: String(task.priority || "normal"),
      date: task.date || null,
      deadline: task.deadline || null,
      done: Boolean(task.done)
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
    const deadlineIncomplete = incomplete
      .filter(task => task.deadline)
      .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));
    const calendarEvents = incomplete
      .filter(task => task.date && task.date >= today && task.date <= twoWeeksLater)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(0, 30)
      .map(compactTask);
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
      todayFocusMinutes: sumMinutes(todaySessions),
      completedTasksToday: completedToday.slice(0, 30).map(compactTask),
      incompleteTasks: incomplete.slice(0, 50).map(compactTask),
      deadlineIncompleteTasks: deadlineIncomplete.slice(0, 30).map(compactTask),
      todayCategoryMinutes: sumByCategory(todaySessions),
      last7DaysCategoryMinutes: sevenDayCategoryMinutes,
      calendarEvents,
      tomorrowTasks: incomplete.filter(task => task.date === tomorrow || task.deadline === tomorrow).slice(0, 20).map(compactTask),
      manualLogs,
      recentFrequentCategories: trends.frequent,
      recentInsufficientCategories: trends.insufficient,
      mainGoals,
      todayReview: String(data.reviews[today] || "").slice(0, 1000)
    };
  }

  function priorityTask(summary) {
    const tasks = summary.incompleteTasks || [];
    const overdue = (summary.deadlineIncompleteTasks || []).find(task => task.deadline <= summary.today);
    return overdue || tasks.find(task => task.priority === "high" && (task.date === summary.today || task.deadline === summary.today))
      || tasks.find(task => task.priority === "high") || tasks[0] || null;
  }

  function createLocalAdvice(summary, mode = "advice") {
    const total = Number(summary.todayFocusMinutes || 0);
    const hour = Number(summary.currentHour || 0);
    const incompleteCount = (summary.incompleteTasks || []).length;
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
        <div class="ai-secretary-focus">
          <span class="ai-secretary-label">NEXT ACTION</span>
          <div class="ai-secretary-action-row"><strong id="aiSecretaryNext"></strong><span class="ai-secretary-time" id="aiSecretaryTime"></span></div>
          <p class="ai-secretary-reason" id="aiSecretaryReason"></p>
        </div>
        <div class="ai-secretary-grid">
          <div class="ai-secretary-mini"><span>今はやらなくていい</span><p id="aiSecretarySkip"></p></div>
          <div class="ai-secretary-mini"><span>明日に回していい</span><p id="aiSecretaryTomorrow"></p></div>
        </div>
        <p class="ai-secretary-encouragement" id="aiSecretaryEncouragement"></p>
        <div class="ai-secretary-actions">
          <button type="button" data-ai-secretary-mode="advice">AI書記に聞く</button>
          <button type="button" data-ai-secretary-mode="review">今日の振り返り</button>
          <button type="button" data-ai-secretary-mode="tomorrow">明日の作戦</button>
        </div>
        <div class="ai-secretary-status" id="aiSecretaryStatus" aria-live="polite"></div>
      </div>`;
    return card;
  }

  function renderAdvice(advice, source, mode) {
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
    try {
      const remote = await requestAiAdvice(summary, mode);
      advice = sanitizeAdvice(remote, fallback);
      source = "AI提案";
    } catch (error) {
      console.info("AI書記: API未接続または失敗のためローカル提案を表示します。", error);
    } finally {
      card?.classList.remove("is-loading");
      buttons.forEach(button => { button.disabled = false; });
    }
    renderAdvice(advice, source, mode);
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
    if (initial?.advice) {
      renderAdvice(initial.advice, initial.source || "保存済み", initial.mode || "advice");
    } else {
      const summary = buildAiSecretarySummary();
      renderAdvice(createLocalAdvice(summary, "advice"), "ローカル提案", "advice");
    }

    card.querySelectorAll("[data-ai-secretary-mode]").forEach(button => {
      button.addEventListener("click", () => handleRequest(button.dataset.aiSecretaryMode || "advice"));
    });
  }

  window.AiSecretary = {
    buildSummary: buildAiSecretarySummary,
    createLocalAdvice,
    ask: handleRequest
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initializeAiSecretary);
  else initializeAiSecretary();
})();
