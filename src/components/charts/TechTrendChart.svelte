<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface TrendItem {
    yearMonth: string;
    count: number;
  }

  interface Props {
    trends: Record<string, TrendItem[]>;
    startMonth?: string;
    endMonth?: string;
  }

  let { trends, startMonth, endMonth }: Props = $props();

  let chartContainer: HTMLDivElement;
  let chart: echarts.ECharts;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
  const TOP_N = 8;

  let topNames = $derived(Object.keys(trends).slice(0, TOP_N));

  let filteredTrends = $derived.by(() => {
    const result: Record<string, TrendItem[]> = {};
    for (const name of topNames) {
      let items = trends[name] || [];
      if (startMonth) items = items.filter((d) => d.yearMonth >= startMonth);
      if (endMonth) items = items.filter((d) => d.yearMonth <= endMonth);
      result[name] = items;
    }
    return result;
  });

  let months = $derived.by(() => {
    const allMonths = new Set<string>();
    for (const items of Object.values(filteredTrends)) {
      for (const item of items) {
        allMonths.add(item.yearMonth);
      }
    }
    return [...allMonths].sort();
  });

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function getChartOptions(): echarts.EChartsOption {
    const dark = isDark();

    const series = topNames.map((name, i) => {
      const items = filteredTrends[name] || [];
      const dataMap = new Map(items.map((d) => [d.yearMonth, d.count]));
      return {
        name,
        type: 'line' as const,
        data: months.map((m) => dataMap.get(m) ?? 0),
        smooth: 0.3,
        symbol: 'none',
        lineStyle: { width: 2, color: COLORS[i % COLORS.length] },
        emphasis: {
          focus: 'series' as const,
          itemStyle: {
            color: COLORS[i % COLORS.length],
            borderColor: dark ? '#0a0a0a' : '#fff',
            borderWidth: 2,
          },
        },
      };
    });

    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: 'Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        color: dark ? '#a3a3a3' : '#4b5563',
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: dark ? '#1a1a1a' : '#ffffff',
        borderColor: dark ? '#262626' : '#e5e7eb',
        textStyle: {
          color: dark ? '#f5f5f5' : '#111827',
          fontSize: 13,
        },
        formatter(params: any) {
          const items = Array.isArray(params) ? params : [params];
          const sorted = [...items].sort((a: any, b: any) => b.value - a.value);
          let html = `<div style="font-variant-numeric:tabular-nums;font-size:12px;color:${dark ? '#a3a3a3' : '#4b5563'};margin-bottom:4px">${sorted[0]?.axisValue}</div>`;
          for (const item of sorted) {
            if (item.value > 0) {
              html += `<div style="display:flex;align-items:center;gap:6px;margin:2px 0">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color}"></span>
                <span style="flex:1">${item.seriesName}</span>
                <span style="font-weight:600">${item.value}</span>
              </div>`;
            }
          }
          return html;
        },
      },
      legend: {
        bottom: 0,
        textStyle: {
          color: dark ? '#a3a3a3' : '#4b5563',
          fontSize: 12,
        },
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 3,
        itemGap: 16,
      },
      grid: {
        left: 48,
        right: 24,
        top: 16,
        bottom: 48,
        containLabel: false,
      },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: { lineStyle: { color: dark ? '#262626' : '#e5e7eb' } },
        axisTick: { show: false },
        axisLabel: {
          color: dark ? '#525252' : '#9ca3af',
          fontSize: 11,
          interval: (index: number) => {
            const m = months[index];
            if (!m) return false;
            if (months.length <= 24) return index % 3 === 0;
            return m.endsWith('-01') || m.endsWith('-07');
          },
          formatter: (value: string) => {
            const [year, month] = value.split('-');
            return month === '01' ? year : `${month}月`;
          },
        },
      },
      yAxis: {
        type: 'value',
        splitLine: {
          lineStyle: {
            color: dark ? '#1a1a1a' : '#f3f4f6',
            type: 'dashed',
          },
        },
        axisLabel: {
          color: dark ? '#525252' : '#9ca3af',
          fontSize: 11,
        },
      },
      series,
    };
  }

  $effect(() => {
    filteredTrends;
    months;
    if (chart) {
      chart.setOption(getChartOptions(), true);
    }
  });

  onMount(() => {
    chart = echarts.init(chartContainer);
    chart.setOption(getChartOptions());

    const resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartContainer);

    const observer = new MutationObserver(() => {
      chart?.setOption(getChartOptions());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      resizeObserver.disconnect();
      observer.disconnect();
      chart?.dispose();
    };
  });
</script>

<div bind:this={chartContainer} class="h-[400px] w-full"></div>
