let cfChart = null;

// ── 試算表（残高試算表年間推移 確定版 0427）からのコストデータ ──
// 株式会社４DIN 2025/10〜2026/03 確定実績 + 4月以降予測（直近6ヶ月平均ベース）
// ※ 減価償却費は非資金項目のため営業CF出金から除外
const trialBalanceCosts = (function() {
  // ── 損益計算書 確定データ（円） ──
  const actual = {
    '2025-10': {
      cogs: { salary: 6880169, welfare: 1177328, telecom: 3897253, depreciation: 233193, outsource: 743872, license: 1224293, purchase: 1854100 },
      sga:  { salary: 4724170, welfare: 610716, benefits: 168887, recruit: 87823, advertising: 467177, entertainment: 885585, meeting: 176537, travel: 1725263, telecom: 172487, supplies: 41369, utilities: 3784, dues: 133333, fees: 1667870, rent: 190000, lease: 8700, insurance: 57172, tax: 26960, professional: 937300, outsource: 5197263, donation: 0, rnd: 59092, depreciation: 111250, books: 0 },
      interest: 74235, incomeInterest: 0, miscIncome: 13063
    },
    '2025-11': {
      cogs: { salary: 7682693, welfare: 1326637, telecom: 3487906, depreciation: 233193, outsource: 763872, license: 1224293, purchase: 0 },
      sga:  { salary: 4733818, welfare: 610716, benefits: 121126, recruit: 40914, advertising: 466300, entertainment: 1046183, meeting: 25416, travel: 1318875, telecom: 191267, supplies: 214514, utilities: 5420, dues: 126333, fees: 138997, rent: 190000, lease: 8700, insurance: 57172, tax: 2600, professional: 937300, outsource: 5070062, donation: 0, rnd: 0, depreciation: 111250, books: 0 },
      interest: 41096, incomeInterest: 0, miscIncome: 12618
    },
    '2025-12': {
      cogs: { salary: 8542157, welfare: 1389024, telecom: 3287903, depreciation: 233193, outsource: 261874, license: 1224293, purchase: 0 },
      sga:  { salary: 4728500, welfare: 610769, benefits: 25000, recruit: 46366, advertising: 1340910, entertainment: 1058260, meeting: 32597, travel: 1548283, telecom: 170615, supplies: 676045, utilities: 5830, dues: 340333, fees: 142560, rent: 190000, lease: 8700, insurance: 111142, tax: 33000, professional: 937300, outsource: 6330065, donation: 45000, rnd: 0, depreciation: 127537, books: 0 },
      interest: 78712, incomeInterest: 0, miscIncome: 12547
    },
    '2026-01': {
      cogs: { salary: 8988245, welfare: 1446261, telecom: 3426596, depreciation: 233193, outsource: 709500, license: 1224293, purchase: 0 },
      sga:  { salary: 5395167, welfare: 719684, benefits: 41453, recruit: 46638, advertising: 704264, entertainment: 895133, meeting: 26667, travel: 1373612, telecom: 197487, supplies: 116546, utilities: 5898, dues: 94333, fees: 145300, rent: 190000, lease: 8700, insurance: 57172, tax: 520, professional: 1032300, outsource: 5221697, donation: 0, rnd: 0, depreciation: 253871, books: 0 },
      interest: 71463, incomeInterest: 0, miscIncome: 12632
    },
    '2026-02': {
      cogs: { salary: 9318020, welfare: 1450219, telecom: 3330264, depreciation: 266276, outsource: 692550, license: 2246426, purchase: 0 },
      sga:  { salary: 5395167, welfare: 719684, benefits: 64982, recruit: 0, advertising: 1307508, entertainment: 1294875, meeting: 12002, travel: 1677705, telecom: 218139, supplies: 52314, utilities: 7160, dues: 133333, fees: 224653, rent: 190000, lease: 8700, insurance: 57172, tax: 131600, professional: 1452300, outsource: 5797790, donation: 0, rnd: 0, depreciation: 368833, books: 29260 },
      interest: 127626, incomeInterest: 158280, miscIncome: 63478
    },
    '2026-03': {
      cogs: { salary: 9344266, welfare: 1460863, telecom: 2942073, depreciation: 266276, outsource: 0, license: 2217840, purchase: 0 },
      sga:  { salary: 5395167, welfare: 718842, benefits: 64703, recruit: 4546, advertising: 31620, entertainment: 852351, meeting: 19092, travel: 1098444, telecom: 212648, supplies: 255040, utilities: 5864, dues: 86337, fees: 188342, rent: 190000, lease: 8700, insurance: 57172, tax: 59620, professional: 1205300, outsource: 11975563, donation: 0, rnd: 0, depreciation: 199618, books: 0 },
      interest: 184387, incomeInterest: 0, miscIncome: 24719
    }
  };

  // ── 貸借対照表 現金預金残高（円）──
  const cashBalances = {
    '2025-10': 172141964,
    '2025-11': 151403071,
    '2025-12': 122905510,
    '2026-01': 90260888,
    '2026-02': 64932637,
    '2026-03': 34052715,
  };

  // ── 売上高 確定データ（円）──
  const salesActual = {
    '2025-10': 11610449,
    '2025-11': 11704449,
    '2025-12': 17006654,
    '2026-01': 14339450,
    '2026-02': 17774450,
    '2026-03': 24431440,
  };

  function sumObj(o) { return Object.values(o).reduce((a,b)=>a+b,0); }

  // 直近6ヶ月平均をベースに4月以降を予測
  const baseMonths = Object.keys(actual);
  const avgCogs = {}, avgSga = {};
  for(const k of Object.keys(actual['2025-10'].cogs)) {
    avgCogs[k] = Math.round(baseMonths.reduce((s,ym) => s + (actual[ym].cogs[k]||0), 0) / baseMonths.length);
  }
  for(const k of Object.keys(actual['2025-10'].sga)) {
    avgSga[k] = Math.round(baseMonths.reduce((s,ym) => s + (actual[ym].sga[k]||0), 0) / baseMonths.length);
  }
  const avgInterest = Math.round(baseMonths.reduce((s,ym) => s + actual[ym].interest, 0) / baseMonths.length);

  return {
    actual, cashBalances, salesActual,
    // 万円単位で返却（試算表は円単位）
    getMonthlyCost(ym) {
      const m = actual[ym];
      const src = m ? 'actual' : 'forecast';
      const cogs = m ? m.cogs : avgCogs;
      const sga  = m ? m.sga  : avgSga;
      const interest = m ? m.interest : avgInterest;

      // 減価償却費は非資金項目なので営業CF出金から除外
      const cogsDepreciation = cogs.depreciation || 0;
      const sgaDepreciation  = sga.depreciation || 0;
      const cogsCash = (sumObj(cogs) - cogsDepreciation) / 10000;
      const sgaCash  = (sumObj(sga) - sgaDepreciation) / 10000;

      // 営業CF出金の内訳カテゴリ
      const personnelCost = ((cogs.salary||0) + (cogs.welfare||0) + (sga.salary||0) + (sga.welfare||0) + (sga.benefits||0)) / 10000;
      const outsourceCost = ((cogs.outsource||0) + (sga.outsource||0) + (sga.professional||0)) / 10000;
      const infraCost     = ((cogs.telecom||0) + (cogs.license||0) + (sga.telecom||0) + (sga.rent||0) + (sga.lease||0) + (sga.utilities||0) + (sga.insurance||0)) / 10000;
      const bizExpCost    = ((cogs.purchase||0) + (sga.travel||0) + (sga.entertainment||0) + (sga.meeting||0) + (sga.advertising||0) + (sga.recruit||0) + (sga.supplies||0) + (sga.dues||0) + (sga.fees||0) + (sga.tax||0) + (sga.donation||0) + (sga.rnd||0) + (sga.books||0)) / 10000;
      const interestMan   = interest / 10000;

      return {
        cogsCash, sgaCash,
        totalCashOut: cogsCash + sgaCash,
        interest: interestMan,
        source: src,
        breakdown: { personnelCost, outsourceCost, infraCost, bizExpCost }
      };
    },
    // 月末の現金預金残高（万円）
    getClosingCash(ym) {
      return cashBalances[ym] !== undefined ? cashBalances[ym] / 10000 : null;
    },
    // 売上高（万円）
    getSales(ym) {
      return salesActual[ym] !== undefined ? salesActual[ym] / 10000 : null;
    },
    avgCogs, avgSga, sumObj
  };
})();

// ── 請求予定日 → 入金予定月キー(YYYY-MM)を算出 ──
// billingDateStr: 'YYYY-MM-DD' 形式の請求予定日
// 戻り値: 翌月のYYYY-MMキー
// ── 請求日 + 入金サイト日数 → 入金予定日(YYYY-MM-DD) ──
function calcPaymentDate(billingDateStr, billingSite) {
  if(!billingDateStr) return '';
  const d = new Date(billingDateStr);
  if(isNaN(d.getTime())) return '';
  const site = parseInt(billingSite) || 0;
  if(site > 0) {
    // 入金サイト: 請求日 + site日後
    d.setDate(d.getDate() + site);
  } else {
    // デフォルト: 翌月最終営業日
    d.setMonth(d.getMonth() + 1);
    // 翌月末日を計算
    const y = d.getFullYear(), m = d.getMonth();
    const lastDay = new Date(y, m + 1, 0);
    const dow = lastDay.getDay();
    if(dow === 0) lastDay.setDate(lastDay.getDate() - 2);
    else if(dow === 6) lastDay.setDate(lastDay.getDate() - 1);
    return lastDay.toISOString().split('T')[0];
  }
  // 土日なら前倒し
  const dow = d.getDay();
  if(dow === 0) d.setDate(d.getDate() - 2);
  else if(dow === 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function billingDateToPaymentYm(billingDateStr, billingSite) {
  const pd = calcPaymentDate(billingDateStr, billingSite);
  return pd ? pd.slice(0, 7) : '';
}

// ── 月キー → その月の最終営業日(YYYY-MM-DD) ──
function lastBizDayOfMonth(ymKey) {
  const [y, m] = ymKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0); // m月の末日
  const dow = lastDay.getDay();
  if(dow === 0) lastDay.setDate(lastDay.getDate() - 2);
  else if(dow === 6) lastDay.setDate(lastDay.getDate() - 1);
  return lastDay.toISOString().split('T')[0];
}

// ── 案件ごとに全月の請求予定と入金予定を構築 ──
// 入金予測は「売上回収時期」（billingType / billingSite）を優先使用
function buildOppBillingForecast(opp, forecastEndYm) {
  const records = []; // [{billingYm, billingDate, billingAmt, paymentYm, paymentDate, source}]
  const oppId = opp.id;
  const site = opp.billingSite || 0; // 入金サイト（日数）

  // (1) 既に db.monthly に請求データがある月（実績＋手入力済み）
  const existingBillingYms = new Set();
  Object.keys(db.monthly).sort().forEach(ym => {
    const m = db.monthly[ym]?.[oppId];
    if(!m) return;
    const bAmt = m.billing || 0;
    if(bAmt <= 0) return;
    existingBillingYms.add(ym);

    // 請求日: m.billingDate → 月末フォールバック
    const billingDate = m.billingDate || lastBizDayOfMonth(ym);
    // 入金予定: 案件の入金サイトで計算
    const paymentDate = m.paymentDate || calcPaymentDate(billingDate, site);
    const paymentYm = paymentDate ? paymentDate.slice(0, 7) : '';
    // 入金実績
    const cashAmt = m.cash || 0;

    records.push({
      billingYm: ym,
      billingDate,
      billingAmt: bAmt,
      paymentYm,
      paymentDate,
      cashAmt,
      source: 'actual',
    });
  });

  // (2) 将来月の請求予測（まだ db.monthly にないもの）
  // 売上回収時期（billingType）に基づいて請求スケジュールを予測
  if(opp.billingType === 'monthly' && opp.start) {
    // 月次請求: 契約期間の各月に月次請求
    const startYm = opp.start.slice(0, 7);
    const endYm   = opp.end ? opp.end.slice(0, 7) : forecastEndYm;
    const totalMonths = monthsBetween(startYm, endYm) + 1;
    if(totalMonths > 0) {
      const monthlyAmt = Math.round((opp.amount / totalMonths) * 10000) / 10000;
      let ym = startYm;
      for(let i = 0; i < totalMonths && ym <= forecastEndYm; i++) {
        if(!existingBillingYms.has(ym) && ym > currentMonth) {
          const billingDate = lastBizDayOfMonth(ym);
          const paymentDate = calcPaymentDate(billingDate, site);
          const paymentYm = paymentDate ? paymentDate.slice(0, 7) : '';
          records.push({
            billingYm: ym, billingDate, billingAmt: monthlyAmt,
            paymentYm, paymentDate, cashAmt: 0, source: 'forecast',
          });
        }
        ym = nextMonthKey(ym);
      }
    }
  } else if(opp.billingType === 'lump') {
    // 一括請求: billingDate月に全額請求
    if(existingBillingYms.size === 0 && opp.amount > 0) {
      const bDateStr = opp.billingDate || opp.start || '';
      if(bDateStr) {
        const billingYm = bDateStr.slice(0, 7);
        if(billingYm > currentMonth && billingYm <= forecastEndYm) {
          const billingDate = opp.billingDate || lastBizDayOfMonth(billingYm);
          const paymentDate = calcPaymentDate(billingDate, site);
          const paymentYm = paymentDate ? paymentDate.slice(0, 7) : '';
          records.push({
            billingYm, billingDate, billingAmt: opp.amount,
            paymentYm, paymentDate, cashAmt: 0, source: 'forecast',
          });
        }
      }
    }
  } else if(opp.billingType === 'milestone') {
    // マイルストーン: db.monthly のスケジュール(billing or sales)から予測
    const allYms = Object.keys(db.monthly).sort();
    allYms.forEach(ym => {
      if(ym <= currentMonth) return;
      if(ym > forecastEndYm) return;
      if(existingBillingYms.has(ym)) return;
      const m = db.monthly[ym]?.[oppId];
      if(!m) return;
      const amt = m.billing || m.sales || 0;
      if(amt <= 0) return;
      const billingDate = m.billingDate || lastBizDayOfMonth(ym);
      const paymentDate = calcPaymentDate(billingDate, site);
      const paymentYm = paymentDate ? paymentDate.slice(0, 7) : '';
      records.push({
        billingYm: ym, billingDate, billingAmt: amt,
        paymentYm, paymentDate, cashAmt: 0, source: 'forecast',
      });
    });
  } else {
    // billingType未設定 → 計上方式(recog)からフォールバック予測
    if(opp.recog === '月額按分' && opp.start && opp.end) {
      const startYm = opp.start.slice(0, 7);
      const endYm   = opp.end.slice(0, 7);
      const totalMonths = monthsBetween(startYm, endYm) + 1;
      if(totalMonths > 0) {
        const monthlyAmt = Math.round((opp.amount / totalMonths) * 10000) / 10000;
        let ym = startYm;
        for(let i = 0; i < totalMonths && ym <= forecastEndYm; i++) {
          if(!existingBillingYms.has(ym) && ym > currentMonth) {
            const billingDate = lastBizDayOfMonth(ym);
            const paymentDate = calcPaymentDate(billingDate, site);
            const paymentYm = paymentDate ? paymentDate.slice(0, 7) : '';
            records.push({
              billingYm: ym, billingDate, billingAmt: monthlyAmt,
              paymentYm, paymentDate, cashAmt: 0, source: 'forecast',
            });
          }
          ym = nextMonthKey(ym);
        }
      }
    } else if(opp.recog === '進行基準') {
      const allYms = Object.keys(db.monthly).sort();
      allYms.forEach(ym => {
        if(ym <= currentMonth) return;
        if(ym > forecastEndYm) return;
        if(existingBillingYms.has(ym)) return;
        const m = db.monthly[ym]?.[oppId];
        if(!m || (m.sales || 0) <= 0) return;
        const billingDate = lastBizDayOfMonth(ym);
        const paymentDate = calcPaymentDate(billingDate, site);
        const paymentYm = paymentDate ? paymentDate.slice(0, 7) : '';
        records.push({
          billingYm: ym, billingDate, billingAmt: m.sales,
          paymentYm, paymentDate, cashAmt: 0, source: 'forecast',
        });
      });
    } else if(opp.recog === '一括計上' || opp.recog === '検収基準') {
      if(existingBillingYms.size === 0 && opp.amount > 0) {
        const bDateStr = opp.billingDate || opp.start || '';
        if(bDateStr) {
          const billingYm = bDateStr.slice(0, 7);
          if(billingYm > currentMonth && billingYm <= forecastEndYm) {
            const billingDate = opp.billingDate || lastBizDayOfMonth(billingYm);
            const paymentDate = calcPaymentDate(billingDate, site);
            const paymentYm = paymentDate ? paymentDate.slice(0, 7) : '';
            records.push({
              billingYm, billingDate, billingAmt: opp.amount,
              paymentYm, paymentDate, cashAmt: 0, source: 'forecast',
            });
          }
        }
      }
    }
  }

  return records;
}

function buildCashflowData() {
  const rangeMonths = parseInt(document.getElementById('cf-range')?.value || '12');
  const statusFilter = document.getElementById('cf-status-filter')?.value || '';

  // 表示対象月リスト: 過去3ヶ月 ～ 当月 ～ 未来N月
  const months = [];
  for(let i = -3; i <= rangeMonths; i++) {
    months.push(addMonthKey(currentMonth, i));
  }
  const forecastEndYm = months[months.length - 1];

  // 対象案件
  const opps = db.opportunities.filter(o => {
    if(!matchesScope(o)) return false;
    if(statusFilter === 'pipeline') return !['失注'].includes(o.stage);
    return o.stage === '受注';
  });

  // パイプラインの場合、確度で加重する
  const useProbWeight = statusFilter === 'pipeline';

  // 月別集計用マップ
  const monthMap = {};
  months.forEach(ym => {
    monthMap[ym] = { sales: 0, billing: 0, cashActual: 0, cashForecast: 0, costOut: 0, costSource: 'forecast', interest: 0, depreciation: 0, costBreakdown: null };
  });

  // 案件別の予測レコードも保持
  const oppForecasts = [];

  opps.forEach(o => {
    const weight = useProbWeight ? ((o.prob || 0) / 100) : 1;
    const records = buildOppBillingForecast(o, forecastEndYm);
    oppForecasts.push({ opp: o, records, weight });

    records.forEach(r => {
      // 請求月に請求額を計上
      if(monthMap[r.billingYm]) {
        monthMap[r.billingYm].billing += r.billingAmt * weight;
      }
      // 入金月に入金を計上
      if(r.paymentYm && monthMap[r.paymentYm]) {
        if(r.cashAmt > 0) {
          // 入金実績あり
          monthMap[r.paymentYm].cashActual += r.cashAmt * weight;
        } else if(r.source === 'actual' && r.billingYm <= currentMonth) {
          // 過去～当月の請求で未入金 → 入金予測
          monthMap[r.paymentYm].cashForecast += r.billingAmt * weight;
        } else if(r.source === 'forecast') {
          // 将来請求 → 入金予測
          monthMap[r.paymentYm].cashForecast += r.billingAmt * weight;
        } else if(r.source === 'actual' && r.billingYm > currentMonth) {
          // 未来月にスケジュール済みだが未入金
          monthMap[r.paymentYm].cashForecast += r.billingAmt * weight;
        }
      }
    });

    // 売上は既存 db.monthly から
    months.forEach(ym => {
      const m = (db.monthly[ym] || {})[o.id];
      if(m && m.sales) {
        monthMap[ym].sales += (m.sales || 0) * weight;
      }
    });
  });

  // ── 試算表コストデータを各月に反映 ──
  months.forEach(ym => {
    const cost = trialBalanceCosts.getMonthlyCost(ym);
    monthMap[ym].costOut = cost.totalCashOut;
    monthMap[ym].costSource = cost.source;
    monthMap[ym].interest = cost.interest;
    monthMap[ym].costBreakdown = cost.breakdown;
    // 試算表に売上実績があれば上書き
    const tbSales = trialBalanceCosts.getSales(ym);
    if(tbSales !== null) monthMap[ym].sales = tbSales;
  });

  // ── 実績月の現金預金残高（貸借対照表）──
  // 期末残高がわかる月は、そこから期首残高と実際のネットCFを逆算できる
  const actualClosingCash = {};
  months.forEach(ym => {
    const bal = trialBalanceCosts.getClosingCash(ym);
    if(bal !== null) actualClosingCash[ym] = bal;
  });

  // ── 投資・財務CF 個別イベント（万円） ──
  const investFinEvents = {
    '2026-04': { amount: 139809435 / 10000, label: '第三者割当増資' },
  };

  // monthlyTotals 配列 ─ CF計算書構造(I〜VII)
  // 実績月（10月〜3月）: BS現金預金残高から期首・期末を直接設定
  // 予測月（4月〜）  : 最終実績月の期末残高から営業CF＋財務CFで順算

  // まず各月のCF項目を計算
  const monthCFs = months.map(ym => {
    const d = monthMap[ym];
    const isPast = ym < currentMonth;
    const isCurrent = ym === currentMonth;
    const hasActualBal = actualClosingCash[ym] !== undefined;

    let cashActual = 0, cashForecast = 0;
    if(hasActualBal || isPast) {
      cashActual = d.cashActual;
      cashForecast = 0;
    } else if(isCurrent) {
      cashActual = d.cashActual;
      cashForecast = d.cashForecast;
    } else {
      cashForecast = d.cashForecast;
    }

    const opCashIn = cashActual + cashForecast;
    const opCashOut = d.costOut;
    const opNetCF = opCashIn - opCashOut;
    // 投資・財務CF = −支払利息 ＋ 個別イベント（増資・借入等）
    const eventCF = investFinEvents[ym] ? investFinEvents[ym].amount : 0;
    const investFinCF = -d.interest + eventCF;
    const netChange = opNetCF + investFinCF;
    const eventLabel = investFinEvents[ym] ? investFinEvents[ym].label : '';
    return { ym, opCashIn, opCashOut, opNetCF, investFinCF, netChange, cashActual, cashForecast, isPast, isCurrent, hasActualBal, eventCF, eventLabel, d };
  });

  // 期首・期末残高を設定
  const openBals = new Array(monthCFs.length).fill(0);
  const closeBals = new Array(monthCFs.length).fill(0);
  const actualNetChanges = new Array(monthCFs.length).fill(null);

  // ステップ1: 実績月はBS残高から直接設定
  // 最初の実績月の期首残高 = 前月の期末残高（前月にBS残高があれば）
  // 各実績月の期末残高 = actualClosingCash[ym]
  // ネットCF(実際) = 期末 - 期首
  const sortedActualYms = months.filter(ym => actualClosingCash[ym] !== undefined);

  if(sortedActualYms.length > 0) {
    // 最初の実績月の開始: 前月末のBS残高があればそれを使う
    const firstActualIdx = months.indexOf(sortedActualYms[0]);

    // 各実績月を設定
    for(let i = 0; i < sortedActualYms.length; i++) {
      const ym = sortedActualYms[i];
      const idx = months.indexOf(ym);
      closeBals[idx] = actualClosingCash[ym];

      if(i === 0) {
        // 最初の月: 前月のBS残高を探す
        const prevYm = addMonthKey(ym, -1);
        if(actualClosingCash[prevYm] !== undefined) {
          openBals[idx] = actualClosingCash[prevYm];
        } else {
          // 前月のBS残高がない → netChangeから逆算不可、closeBal + netChangeで推定
          // ここでは期末残高とPL上のnetChangeから逆算
          openBals[idx] = closeBals[idx] - monthCFs[idx].netChange;
        }
      } else {
        // 前月の期末残高 = 当月の期首残高
        openBals[idx] = closeBals[months.indexOf(sortedActualYms[i-1])];
      }
      // 実際のネットCF = 期末 - 期首（PL計算と異なる場合がある＝BS上の資金移動含む）
      actualNetChanges[idx] = closeBals[idx] - openBals[idx];
    }

    // ステップ2: 予測月は最終実績月の期末残高から順算
    const lastActualIdx = months.indexOf(sortedActualYms[sortedActualYms.length - 1]);
    for(let i = lastActualIdx + 1; i < months.length; i++) {
      openBals[i] = closeBals[i - 1];
      closeBals[i] = openBals[i] + monthCFs[i].netChange;
    }

    // ステップ3: 最初の実績月より前（表示対象の過去月）も逆算
    for(let i = firstActualIdx - 1; i >= 0; i--) {
      closeBals[i] = openBals[i + 1];
      openBals[i] = closeBals[i] - monthCFs[i].netChange;
    }
  }

  const monthlyTotals = monthCFs.map((mc, idx) => {
    const r = v => Math.round(v * 100) / 100;
    const openBal = r(openBals[idx]);
    const closeBal = r(closeBals[idx]);
    // 実績月はBS差額がネットCF、予測月はPL計算のnetChange
    const netChange = actualNetChanges[idx] !== null ? r(actualNetChanges[idx]) : r(mc.netChange);
    // 実績月で投資・財務CFにBS差額との差分を反映
    let investFinCF = r(mc.investFinCF);
    let opNetCF = r(mc.opNetCF);
    if(actualNetChanges[idx] !== null) {
      // BS上の実際のネットCF と PL上の営業CF＋財務CF の差 → 投資・財務CFに吸収
      const plNetChange = r(mc.netChange);
      const bsDiff = netChange - plNetChange;
      investFinCF = r(mc.investFinCF + bsDiff);
    }

    return {
      ym: mc.ym,
      label: monthLabel(mc.ym),
      shortLabel: mc.ym.split('-')[1] + '月',
      sales: r(mc.d.sales), billing: r(mc.d.billing),
      cashActual: r(mc.cashActual), cashForecast: r(mc.cashForecast),
      openBal, opCashIn: r(mc.opCashIn), opCashOut: r(mc.opCashOut),
      opNetCF, investFinCF, netChange, closeBal,
      costSource: mc.d.costSource,
      costBreakdown: mc.d.costBreakdown,
      interest: r(mc.d.interest),
      eventCF: r(mc.eventCF), eventLabel: mc.eventLabel,
      isPast: mc.isPast, isCurrent: mc.isCurrent,
      hasActualBal: mc.hasActualBal,
      // 旧互換
      costOut: r(mc.opCashOut), netCash: netChange, cumCash: closeBal,
    };
  });

  return { months, monthlyTotals, opps, oppForecasts, forecastEndYm };
}

function renderCashflow() {
  const data = buildCashflowData();
  const { months, monthlyTotals, opps, oppForecasts } = data;

  // === メトリクスカード ===
  const thisMonth = monthlyTotals.find(m => m.isCurrent) || {};
  const nextMonth = monthlyTotals.find(m => m.ym === addMonthKey(currentMonth, 1)) || {};
  const futureMonths = monthlyTotals.filter(m => !m.isPast && !m.isCurrent);
  const totalForecastCash = futureMonths.reduce((s, m) => s + m.cashForecast, 0);

  // 未回収残高: 全案件で (請求済 - 入金済) の合計
  let totalUncollected = 0;
  opps.forEach(o => {
    Object.keys(db.monthly).forEach(ym => {
      const m = db.monthly[ym][o.id];
      if(m) totalUncollected += Math.max(0, (m.billing || 0) - (m.cash || 0));
    });
  });

  // 入金遅延リスク: 過去月で請求済・未入金（入金予定月を過ぎている）
  let riskCount = 0;
  oppForecasts.forEach(({ records }) => {
    records.forEach(r => {
      if(r.source === 'actual' && r.billingAmt > 0 && r.cashAmt < r.billingAmt) {
        if(r.paymentYm && r.paymentYm < currentMonth) riskCount++;
      }
    });
  });

  document.getElementById('cf-metrics').innerHTML = `
    <div class="metric-card blue">
      <div class="metric-label">II. 当月 営業CF入金</div>
      <div class="metric-value">${fmt(thisMonth.opCashIn)}</div>
      <div class="metric-change neutral">実績 ${fmt(thisMonth.cashActual)} ／ 予測 ${fmt(thisMonth.cashForecast)}</div>
    </div>
    <div class="metric-card" style="border-left:3px solid var(--purple);">
      <div class="metric-label">III. 当月 営業CF出金</div>
      <div class="metric-value" style="color:var(--red);">${fmt(thisMonth.opCashOut)}</div>
      <div class="metric-change neutral">${thisMonth.costSource === 'actual' ? '試算表実績' : '予測（直近6ヶ月平均）'}</div>
    </div>
    <div class="metric-card ${(thisMonth.netChange||0) >= 0 ? 'green' : 'red'}">
      <div class="metric-label">VI. 当月 純増減額</div>
      <div class="metric-value">${fmt(thisMonth.netChange)}</div>
      <div class="metric-change neutral">営業CF ${fmt(thisMonth.opNetCF)} ＋ 財務CF ${fmt(thisMonth.investFinCF)}</div>
    </div>
    <div class="metric-card green">
      <div class="metric-label">翌月 入金予測</div>
      <div class="metric-value">${fmt(nextMonth.cashForecast)}</div>
      <div class="metric-change neutral">翌月出金予測 ${fmt(nextMonth.opCashOut)}</div>
    </div>
    <div class="metric-card amber">
      <div class="metric-label">未回収残高</div>
      <div class="metric-value">${fmt(totalUncollected)}</div>
      <div class="metric-change neutral">将来入金予測計 ${fmt(totalForecastCash)}</div>
    </div>
    <div class="metric-card red">
      <div class="metric-label">入金遅延リスク</div>
      <div class="metric-value">${riskCount}件</div>
      <div class="metric-change neutral">入金予定月を超過</div>
    </div>
  `;

  // === チャート ===
  renderCashflowChart(monthlyTotals);

  // === 案件別予測データをグローバルに保持（内訳モーダル用）===
  _cfOppForecasts = oppForecasts;

  // === 月別内訳テーブル ===
  renderCashflowTable(monthlyTotals);

  // === 案件別スケジュール ===
  renderCashflowSchedule(oppForecasts);
}

function renderCashflowChart(data) {
  const ctx = document.getElementById('cf-chart');
  if(!ctx) return;
  if(cfChart) { cfChart.destroy(); cfChart = null; }

  const labels = data.map(d => d.shortLabel);
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // 当月のインデックスを見つけてアノテーション用に
  const currentIdx = data.findIndex(d => d.isCurrent);

  cfChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'II. 営業CF入金',
          data: data.map(d => d.opCashIn),
          backgroundColor: isDark ? 'rgba(29,158,117,0.55)' : 'rgba(29,158,117,0.45)',
          borderRadius: 3,
          order: 4,
          barPercentage: 0.75,
        },
        {
          label: 'III. 営業CF出金',
          data: data.map(d => -d.opCashOut),
          backgroundColor: isDark ? 'rgba(226,75,74,0.45)' : 'rgba(226,75,74,0.3)',
          borderColor: isDark ? 'rgba(226,75,74,0.7)' : 'rgba(226,75,74,0.5)',
          borderWidth: 1,
          borderRadius: 3,
          order: 3,
          barPercentage: 0.75,
        },
        {
          label: 'V. 投資・財務CF',
          data: data.map(d => d.investFinCF),
          backgroundColor: isDark ? 'rgba(83,74,183,0.45)' : 'rgba(83,74,183,0.3)',
          borderRadius: 3,
          order: 2,
          barPercentage: 0.75,
        },
        {
          label: 'VI. 純増減額',
          data: data.map(d => d.netChange),
          type: 'line',
          borderColor: isDark ? '#1D9E75' : '#1D9E75',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [6, 3],
          pointRadius: 4,
          pointBackgroundColor: data.map(d => d.netChange >= 0 ? '#1D9E75' : '#E24B4A'),
          tension: 0.3,
          yAxisID: 'y',
          order: 1,
        },
        {
          label: 'VII. 期末残高',
          data: data.map(d => d.closeBal),
          type: 'line',
          borderColor: isDark ? '#E24B4A' : '#A32D2D',
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 3,
          pointBackgroundColor: isDark ? '#E24B4A' : '#A32D2D',
          tension: 0.3,
          yAxisID: 'y1',
          order: 0,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 11 },
            color: isDark ? '#9a9a96' : '#6b6b67',
            boxWidth: 12, padding: 12,
            usePointStyle: false,
          }
        },
        tooltip: {
          callbacks: {
            title: function(items) {
              const idx = items[0].dataIndex;
              const d = data[idx];
              return d.label + (d.isCurrent ? '（当月）' : d.isPast ? '（確定）' : '（予測）');
            },
            label: function(ctx) {
              const val = ctx.parsed.y;
              if(!val && val !== 0) return '';
              return ' ' + ctx.dataset.label + ': ' + fmt(val);
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 11 }, color: isDark ? '#6b6b67' : '#9a9a96' },
          grid: { display: false },
        },
        y: {
          position: 'left',
          ticks: {
            font: { size: 11 },
            color: isDark ? '#6b6b67' : '#9a9a96',
            callback: v => fmt(v),
          },
          grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
          title: { display: true, text: '月額（万円）', font: { size: 11 }, color: isDark ? '#6b6b67' : '#9a9a96' },
        },
        y1: {
          position: 'right',
          ticks: {
            font: { size: 11 },
            color: isDark ? '#E24B4A' : '#A32D2D',
            callback: v => fmt(v),
          },
          grid: { drawOnChartArea: false },
          title: { display: true, text: '累積（万円）', font: { size: 11 }, color: isDark ? '#E24B4A' : '#A32D2D' },
        }
      }
    }
  });
}

function renderCashflowTable(monthlyTotals) {
  if(!monthlyTotals) monthlyTotals = buildCashflowData().monthlyTotals;

  // ── 横型月次CF計算書テーブル ──
  // 行: I〜VII の各項目、列: 各月

  const hdrStyle = 'padding:6px 10px;text-align:right;font-size:11px;white-space:nowrap;min-width:100px;';
  const rowLabelStyle = 'padding:8px 10px;font-weight:500;white-space:nowrap;position:sticky;left:0;z-index:1;';
  const cellStyle = 'padding:6px 10px;text-align:right;font-size:12px;white-space:nowrap;';

  // ヘッダー
  let thead = '<tr>';
  thead += `<th style="${rowLabelStyle}background:var(--bg-secondary);min-width:200px;text-align:left;">項目</th>`;
  monthlyTotals.forEach(m => {
    const bg = m.isCurrent ? 'var(--accent-light)' : 'var(--bg-secondary)';
    thead += `<th style="${hdrStyle}background:${bg};">${m.shortLabel}${m.isCurrent ? '<br><span class="badge badge-blue" style="font-size:9px;">当月</span>' : (m.hasActualBal ? '<br><span class="badge badge-green" style="font-size:9px;">確定</span>' : (!m.isPast ? '<br><span class="badge badge-gray" style="font-size:9px;">予測</span>' : ''))}</th>`;
  });
  thead += '</tr>';
  document.getElementById('cf-thead').innerHTML = thead;

  // CF行定義
  const rows = [
    { key: 'openBal',     label: 'I. 期首現金残高',          cls: 'section-head', color: '' },
    { key: 'opCashIn',    label: 'II. 営業CF（入金）',       cls: 'sub', color: 'var(--green)' },
    { key: '_cashDetail', label: '　　入金実績',             cls: 'detail', color: '' },
    { key: '_cashFcst',   label: '　　入金予測',             cls: 'detail', color: 'var(--amber)' },
    { key: 'opCashOut',   label: 'III. 営業CF（出金）',      cls: 'sub', color: 'var(--red)' },
    { key: '_personnel',  label: '　　人件費',               cls: 'detail', color: '' },
    { key: '_outsource',  label: '　　外注・専門家',          cls: 'detail', color: '' },
    { key: '_infra',      label: '　　通信・家賃・設備',      cls: 'detail', color: '' },
    { key: '_bizexp',     label: '　　旅費・交際・その他',     cls: 'detail', color: '' },
    { key: 'opNetCF',     label: 'IV. 営業CF差引額',         cls: 'section-head', color: '' },
    { key: 'investFinCF', label: 'V. 投資・財務CF',          cls: 'sub', color: 'var(--purple)' },
    { key: '_interest',   label: '　　支払利息',             cls: 'detail', color: '' },
    { key: '_event',      label: '　　増資・借入等',          cls: 'detail', color: 'var(--green)' },
    { key: 'netChange',   label: 'VI. 当月純増減額',         cls: 'total', color: '' },
    { key: 'closeBal',    label: 'VII. 期末現金残高',         cls: 'total-end', color: '' },
  ];

  let html = '';
  rows.forEach(row => {
    const isSectionHead = row.cls === 'section-head';
    const isTotal = row.cls === 'total' || row.cls === 'total-end';
    const isDetail = row.cls === 'detail';
    const rowBg = isTotal ? 'background:var(--bg-secondary);' : '';
    const fontW = (isSectionHead || isTotal) ? 'font-weight:600;' : (isDetail ? 'font-weight:400;color:var(--text-muted);font-size:11px;' : '');
    const stickyBg = isTotal ? 'var(--bg-secondary)' : 'var(--bg-primary)';
    const borderTop = (row.key === 'opNetCF' || row.key === 'netChange' || row.key === 'closeBal') ? 'border-top:1px solid var(--border-medium);' : '';

    html += `<tr style="${rowBg}${borderTop}">`;
    html += `<td style="${rowLabelStyle}${fontW}background:${stickyBg};">${row.label}</td>`;

    monthlyTotals.forEach(m => {
      const bg = m.isCurrent ? 'background:var(--accent-light);' : '';
      let val = 0;
      switch(row.key) {
        case 'openBal': val = m.openBal; break;
        case 'opCashIn': val = m.opCashIn; break;
        case '_cashDetail': val = m.cashActual; break;
        case '_cashFcst': val = m.cashForecast; break;
        case 'opCashOut': val = m.opCashOut; break;
        case '_personnel': val = m.costBreakdown?.personnelCost || 0; break;
        case '_outsource': val = m.costBreakdown?.outsourceCost || 0; break;
        case '_infra': val = m.costBreakdown?.infraCost || 0; break;
        case '_bizexp': val = m.costBreakdown?.bizExpCost || 0; break;
        case 'opNetCF': val = m.opNetCF; break;
        case 'investFinCF': val = m.investFinCF; break;
        case '_interest': val = -m.interest; break;
        case '_event': val = m.eventCF || 0; break;
        case 'netChange': val = m.netChange; break;
        case 'closeBal': val = m.closeBal; break;
      }
      const dash = '<span style="color:var(--text-muted);">—</span>';
      let valColor = row.color || '';
      if(!valColor && (row.key === 'opNetCF' || row.key === 'netChange' || row.key === 'closeBal')) {
        valColor = val < 0 ? 'var(--red)' : 'var(--green)';
      }
      const forecast = (!m.isPast && !m.isCurrent && row.key !== 'openBal' && row.key !== 'closeBal') ? 'font-style:italic;' : '';
      const show = (val !== 0 || isTotal || isSectionHead) ? fmt(val) : dash;
      // 入金行はクリック可能（案件内訳モーダル表示）
      const isClickable = (row.key === 'opCashIn' || row.key === '_cashDetail' || row.key === '_cashFcst') && val !== 0;
      const clickAttr = isClickable ? ` onclick="showCfBreakdown('${m.ym}')" style="${cellStyle}${fontW}${bg}${forecast}${valColor ? 'color:'+valColor+';' : ''}cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px;"` : ` style="${cellStyle}${fontW}${bg}${forecast}${valColor ? 'color:'+valColor+';' : ''}"`;
      html += `<td${clickAttr}>${show}</td>`;
    });
    html += '</tr>';
  });
  document.getElementById('cf-tbody').innerHTML = html;

  // フッター（期間合計）
  const totals = monthlyTotals.reduce((acc, m) => {
    acc.opCashIn += m.opCashIn; acc.opCashOut += m.opCashOut;
    acc.opNetCF += m.opNetCF; acc.investFinCF += m.investFinCF;
    acc.netChange += m.netChange;
    return acc;
  }, { opCashIn: 0, opCashOut: 0, opNetCF: 0, investFinCF: 0, netChange: 0 });
  const last = monthlyTotals[monthlyTotals.length - 1] || {};

  let tfoot = '<tr style="background:var(--bg-tertiary);font-weight:600;">';
  tfoot += `<td style="${rowLabelStyle}background:var(--bg-tertiary);">期間合計</td>`;
  // 合計行は1つのセルに統合
  const colSpan = monthlyTotals.length;
  tfoot += `<td colspan="${colSpan}" style="padding:8px 10px;font-size:12px;">`;
  tfoot += `営業CF入金計: ${fmt(totals.opCashIn)}　／　`;
  tfoot += `<span style="color:var(--red);">営業CF出金計: ${fmt(totals.opCashOut)}</span>　／　`;
  tfoot += `<span style="${totals.opNetCF < 0 ? 'color:var(--red);' : 'color:var(--green);'}">営業CF差引計: ${fmt(totals.opNetCF)}</span>　／　`;
  tfoot += `<span style="color:var(--purple);">投資・財務CF計: ${fmt(totals.investFinCF)}</span>　／　`;
  tfoot += `<span style="${totals.netChange < 0 ? 'color:var(--red);' : 'color:var(--green);'}font-weight:700;">純増減合計: ${fmt(totals.netChange)}</span>`;
  tfoot += '</td></tr>';
  document.getElementById('cf-tfoot').innerHTML = tfoot;
}

// ── グローバル: 直近のoppForecasts保持（モーダルから参照） ──
let _cfOppForecasts = [];

// ── 月別入金内訳モーダル ──
function showCfBreakdown(ym) {
  if(!_cfOppForecasts.length) return;
  const labelYm = monthLabel(ym);

  // 対象月に入金（paymentYm）がある案件レコードを集約
  const breakdown = [];
  _cfOppForecasts.forEach(({ opp, records, weight }) => {
    records.forEach(r => {
      if(r.paymentYm !== ym) return;
      const amt = (r.cashAmt > 0 ? r.cashAmt : r.billingAmt) * weight;
      if(amt <= 0) return;
      breakdown.push({
        customer: opp.customer || '—',
        name: opp.name || '—',
        stage: opp.stage || '',
        recog: opp.recog || '',
        billingType: opp.billingType || '',
        billingSite: opp.billingSite || 0,
        billingYm: r.billingYm,
        billingDate: r.billingDate || '',
        paymentDate: r.paymentDate || '',
        amt,
        isActual: r.cashAmt > 0,
        source: r.source,
        prob: opp.prob,
        weight,
      });
    });
  });

  // 顧客ごとに集約
  const byCustomer = {};
  breakdown.forEach(b => {
    if(!byCustomer[b.customer]) byCustomer[b.customer] = { items: [], total: 0 };
    byCustomer[b.customer].items.push(b);
    byCustomer[b.customer].total += b.amt;
  });
  const grandTotal = breakdown.reduce((s, b) => s + b.amt, 0);

  // HTML構築
  document.getElementById('cf-breakdown-title').textContent = `${labelYm} 入金予定 案件内訳`;
  let html = '';
  html += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding:8px 12px;background:var(--bg-secondary);border-radius:6px;">`;
  html += `<span style="font-size:13px;font-weight:600;">入金予定合計</span>`;
  html += `<span style="font-size:16px;font-weight:700;color:var(--green);">${fmt(grandTotal)}</span>`;
  html += `</div>`;

  if(breakdown.length === 0) {
    html += '<p style="text-align:center;color:var(--text-muted);padding:24px;">該当月の入金予定はありません</p>';
  } else {
    // 顧客別セクション（金額降順）
    const sortedCustomers = Object.entries(byCustomer).sort((a, b) => b[1].total - a[1].total);
    sortedCustomers.forEach(([customer, data]) => {
      html += `<div style="margin-bottom:12px;border:1px solid var(--border-light);border-radius:6px;overflow:hidden;">`;
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-tertiary);border-bottom:1px solid var(--border-light);">`;
      html += `<span style="font-weight:600;font-size:13px;">${customer}</span>`;
      html += `<span style="font-weight:600;font-size:13px;color:var(--green);">${fmt(data.total)}<span style="font-size:11px;color:var(--text-muted);margin-left:4px;">(${data.items.length}件)</span></span>`;
      html += `</div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:12px;">`;
      html += `<thead><tr style="background:var(--bg-secondary);">`;
      html += `<th style="padding:6px 10px;text-align:left;">案件名</th>`;
      html += `<th style="padding:6px 10px;text-align:center;">請求タイプ</th>`;
      html += `<th style="padding:6px 10px;text-align:center;">入金サイト</th>`;
      html += `<th style="padding:6px 10px;text-align:center;">請求月</th>`;
      html += `<th style="padding:6px 10px;text-align:center;">入金予定日</th>`;
      html += `<th style="padding:6px 10px;text-align:right;">入金額</th>`;
      html += `<th style="padding:6px 10px;text-align:center;">種別</th>`;
      html += `</tr></thead><tbody>`;
      data.items.sort((a, b) => b.amt - a.amt).forEach(item => {
        const typeBadge = item.isActual
          ? '<span class="badge badge-green">入金済</span>'
          : (item.source === 'actual'
            ? '<span class="badge badge-amber">未入金</span>'
            : '<span class="badge badge-gray">予測</span>');
        const weightNote = item.weight < 1 ? ` <span style="color:var(--text-muted);font-size:10px;">(確度${Math.round(item.prob)}%加重)</span>` : '';
        const btLabel = {'monthly':'月次','lump':'一括','milestone':'MS'}[item.billingType] || item.recog || '—';
        const siteLabel = item.billingSite > 0 ? `${item.billingSite}日` : '翌月末';
        html += `<tr style="border-top:1px solid var(--border-light);">`;
        html += `<td style="padding:6px 10px;">${item.name}${weightNote}</td>`;
        html += `<td style="padding:6px 10px;text-align:center;"><span class="badge badge-blue">${btLabel}</span></td>`;
        html += `<td style="padding:6px 10px;text-align:center;font-size:11px;">${siteLabel}</td>`;
        html += `<td style="padding:6px 10px;text-align:center;">${monthLabel(item.billingYm)}</td>`;
        html += `<td style="padding:6px 10px;text-align:center;">${item.paymentDate || '—'}</td>`;
        html += `<td style="padding:6px 10px;text-align:right;font-weight:500;">${fmt(item.amt)}</td>`;
        html += `<td style="padding:6px 10px;text-align:center;">${typeBadge}</td>`;
        html += `</tr>`;
      });
      html += `</tbody></table></div>`;
    });
  }

  document.getElementById('cf-breakdown-content').innerHTML = html;
  openModal('cf-breakdown');
}

function renderCashflowSchedule(oppForecasts) {
  if(!oppForecasts) oppForecasts = buildCashflowData().oppForecasts;
  const tbody = document.getElementById('cf-schedule-tbody');
  if(!tbody) return;
  const q = (document.getElementById('cf-search')?.value || '').toLowerCase();

  const rows = oppForecasts.map(({ opp: o, records }) => {
    // 集計
    let totalBilling = 0, totalCash = 0;
    records.forEach(r => { totalBilling += r.billingAmt; totalCash += r.cashAmt; });
    const uncollected = totalBilling - totalCash;

    // 次回の未入金レコードを探す（billingYm > 直近入金済 or 最初の未入金）
    const futureRecords = records
      .filter(r => r.cashAmt < r.billingAmt)
      .sort((a, b) => a.billingYm.localeCompare(b.billingYm));
    const nextRecord = futureRecords[0] || null;
    const nextBillingYm  = nextRecord?.billingYm || '';
    const nextPaymentYm  = nextRecord?.paymentYm || '';
    const nextPaymentAmt = nextRecord ? (nextRecord.billingAmt - nextRecord.cashAmt) : 0;

    // ステータス
    let status = 'normal';
    if(nextRecord && nextRecord.paymentYm && nextRecord.paymentYm < currentMonth && nextRecord.cashAmt < nextRecord.billingAmt) {
      status = 'overdue';
    } else if(totalBilling === 0) {
      status = 'unbilled';
    } else if(uncollected <= 0) {
      status = 'complete';
    }

    return { o, totalBilling, totalCash, uncollected, nextBillingYm, nextPaymentYm, nextPaymentAmt, status };
  }).filter(r => {
    if(r.o.amount <= 0) return false;
    if(q && !r.o.name.toLowerCase().includes(q) && !(r.o.customer||'').toLowerCase().includes(q)) return false;
    return true;
  });

  // ソート: overdue → unbilled → normal → complete
  const statusOrder = { overdue: 0, unbilled: 1, normal: 2, complete: 3 };
  rows.sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9) || b.uncollected - a.uncollected);

  const statusBadgeMap = {
    overdue:  '<span class="badge badge-red">入金遅延</span>',
    unbilled: '<span class="badge badge-amber">未請求</span>',
    normal:   '<span class="badge badge-blue">進行中</span>',
    complete: '<span class="badge badge-green">回収完了</span>',
  };

  tbody.innerHTML = rows.map(r => `
    <tr style="${r.status === 'overdue' ? 'background:var(--red-light);' : ''}">
      <td style="padding:8px;font-weight:500;cursor:pointer;color:var(--accent);" onclick="showOppDetail('${r.o.id}')">${r.o.name}</td>
      <td style="padding:8px;">${r.o.customer || '—'}</td>
      <td style="padding:8px;text-align:center;">${recogBadge(r.o.recog)}</td>
      <td style="padding:8px;text-align:right;font-weight:500;">${fmt(r.o.amount)}</td>
      <td style="padding:8px;text-align:right;">${r.totalBilling ? fmt(r.totalBilling) : '—'}</td>
      <td style="padding:8px;text-align:right;">${r.totalCash ? fmt(r.totalCash) : '—'}</td>
      <td style="padding:8px;text-align:right;${r.uncollected > 0 ? 'color:var(--red);font-weight:600;' : ''}">${r.uncollected > 0 ? fmt(r.uncollected) : '—'}</td>
      <td style="padding:8px;text-align:center;">${r.nextBillingYm ? monthLabel(r.nextBillingYm) : '—'}</td>
      <td style="padding:8px;text-align:center;${r.status==='overdue' ? 'color:var(--red);font-weight:600;' : ''}">${r.nextPaymentYm ? monthLabel(r.nextPaymentYm) : '—'}</td>
      <td style="padding:8px;text-align:right;font-style:italic;color:var(--amber);">${r.nextPaymentAmt > 0 ? fmt(r.nextPaymentAmt) : '—'}</td>
      <td style="padding:8px;text-align:center;">${statusBadgeMap[r.status] || ''}</td>
    </tr>
  `).join('');

  if(rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" style="padding:24px;text-align:center;color:var(--text-muted);">表示可能な受注案件がありません</td></tr>';
  }
}

function exportCashflowCSV() {
  const { monthlyTotals } = buildCashflowData();
  let csv = '\uFEFF月,I.期首残高,II.営業CF入金,入金実績,入金予測,III.営業CF出金,IV.営業CF差引,V.投資財務CF,VI.純増減額,VII.期末残高,状態\n';
  monthlyTotals.forEach(m => {
    const status = m.isCurrent ? '当月' : (m.isPast ? '確定' : '予測');
    csv += `${m.label},${m.openBal},${m.opCashIn},${m.cashActual},${m.cashForecast},${m.opCashOut},${m.opNetCF},${m.investFinCF},${m.netChange},${m.closeBal},${status}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'cashflow_forecast.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSVを出力しました');
}

// ============================================================
// 契約日差分分析（ダッシュボード）
// ============================================================
function renderContractDelay() {
  const el = document.getElementById('dash-contract-delay');
  if(!el) return;

  // plannedStart と contractDate の両方が設定されている案件を抽出
  const targets = db.opportunities.filter(o =>
    o.plannedStart && o.contractDate && matchesScope(o)
  );

  if(targets.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">契約予定日と実際の契約日が両方入力された案件がありません</div>';
    return;
  }

  // 差分を計算（日数）
  const rows = targets.map(o => {
    const planned  = new Date(o.plannedStart);
    const actual   = new Date(o.contractDate);
    const diffDays = Math.round((actual - planned) / 86400000);
    return { o, planned, actual, diffDays };
  }).sort((a, b) => b.diffDays - a.diffDays);  // 遅延が大きい順

  const totalDelay = rows.reduce((s, r) => s + Math.max(0, r.diffDays), 0);
  const avgDelay   = rows.length > 0 ? (totalDelay / rows.length).toFixed(1) : 0;
  const delayed    = rows.filter(r => r.diffDays > 0).length;
  const onTime     = rows.filter(r => r.diffDays <= 0).length;

  // サマリー
  const summaryHtml = `
    <div style="display:flex;gap:12px;padding:14px 20px;flex-wrap:wrap;border-bottom:1px solid var(--border-light);">
      <div class="metric-card amber" style="min-width:120px;">
        <div class="metric-label">遅延件数</div>
        <div class="metric-value">${delayed}件</div>
      </div>
      <div class="metric-card green" style="min-width:120px;">
        <div class="metric-label">予定通り/前倒し</div>
        <div class="metric-value">${onTime}件</div>
      </div>
      <div class="metric-card red" style="min-width:120px;">
        <div class="metric-label">平均遅延日数</div>
        <div class="metric-value">${avgDelay}日</div>
      </div>
      <div class="metric-card gray" style="min-width:120px;">
        <div class="metric-label">分析対象</div>
        <div class="metric-value">${rows.length}件</div>
      </div>
    </div>`;

  // テーブル
  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>
        <tr style="background:var(--bg-secondary);">
          <th style="padding:8px;text-align:left;min-width:160px;">案件名</th>
          <th style="padding:8px;text-align:left;">顧客</th>
          <th style="padding:8px;text-align:left;">担当</th>
          <th style="padding:8px;text-align:center;">契約予定日</th>
          <th style="padding:8px;text-align:center;">実際の契約日</th>
          <th style="padding:8px;text-align:center;">差分（日）</th>
          <th style="padding:8px;text-align:center;">ステータス</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const badge = r.diffDays > 30  ? '<span class="badge badge-red">大幅遅延</span>'
                      : r.diffDays > 0   ? '<span class="badge badge-amber">遅延</span>'
                      : r.diffDays === 0  ? '<span class="badge badge-blue">予定通り</span>'
                      :                    '<span class="badge badge-green">前倒し</span>';
          const diffColor = r.diffDays > 0 ? 'color:var(--red-dark);font-weight:600;'
                          : r.diffDays < 0 ? 'color:var(--green);font-weight:600;' : '';
          return `<tr style="border-bottom:1px solid var(--border-light);">
            <td style="padding:7px 8px;">
              <a href="#" style="color:var(--accent);text-decoration:none;" onclick="showOppDetail('${r.o.id}');return false;">${r.o.name}</a>
            </td>
            <td style="padding:7px 8px;font-size:11px;">${r.o.customer||'—'}</td>
            <td style="padding:7px 8px;font-size:11px;">${r.o.owner||'—'}</td>
            <td style="padding:7px 8px;text-align:center;">${r.o.plannedStart}</td>
            <td style="padding:7px 8px;text-align:center;">${r.o.contractDate}</td>
            <td style="padding:7px 8px;text-align:center;${diffColor}">${r.diffDays > 0 ? '+' : ''}${r.diffDays}日</td>
            <td style="padding:7px 8px;text-align:center;">${badge}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  el.innerHTML = summaryHtml + tableHtml;
}

// ============================================================
// 契約書アップロード時の契約日入力ポップアップ
// ============================================================

// ============================================================
// RENDER: MASTER
// ============================================================

function downloadCSV(content, filename) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast('CSVをダウンロードしました', 'success');
}

// ============================================================
// モバイル サイドバー開閉
// ============================================================
