<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface DataPoint {
    yearMonth: string;
    count: number;
  }

  interface Props {
    data: Record<string, DataPoint[]>;
  }

  let { data }: Props = $props();

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  let chartContainer: HTMLDivElement;
  let chart: echarts.ECharts;
  let startMonth: string | undefined;
  let endMonth: string | undefined;

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function filterByRange(points: DataPoint[]): DataPoint[] {
    return points.filter((p) => {
      if (startMonth && p.yearMonth < startMonth) return false;
      if (endMonth && p.yearMonth > endMonth) return false;
      return true;
    });
  }

  function getChartOptions(): echarts.EChartsOption {
    const dark = isDark();
    const categories = Object.keys(data);
    const filtered = Object.fromEntries(categories.map((k) => [k, filterByRange(data[k])]));
    const allMonths = [...new Set(categories.flatMap((k) => filtered[k].map((d) => d.yearMonth)))].sort();

    return {
      backgroundColor: 'transparent',
      textStyle: { color: dark ? '#a3a3a3' : '#4b5563' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: dark ? '#1f2937' : '#fff',
        borderColor: dark ? '#374151' : '#e5e7eb',
        textStyle: { color: dark ? '#e5e7eb' : '#1f2937' },
      },
      legend: {
        bottom: 0,
        textStyle: { color: dark ? '#a3a3a3' : '#4b5563' },
      },
      grid: { left: 48, right: 16, top: 40, bottom: 48 },
      xAxis: {
        type: 'category',
        data: allMonths,
        boundaryGap: false,
        axisLine: { lineStyle: { color: dark ? '#374151' : '#e5e7eb' } },
        axisLabel: {
          formatter: (v: string) => {
            const [y, m] = v.split('-');
            return m === '01' ? y : '';
          },
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: dark ? '#1f293780' : '#f3f4f6' } },
      },
      series: categories.map((cat, i) => {
        const map = new Map(filtered[cat].map((d) => [d.yearMonth, d.count]));
        return {
          name: cat,
          type: 'line',
          stack: 'total',
          areaStyle: { opacity: 0.35 },
          emphasis: { focus: 'series' },
          symbol: 'none',
          lineStyle: { width: 1.5 },
          color: COLORS[i % COLORS.length],
          data: allMonths.map((m) => map.get(m) ?? 0),
        };
      }),
    };
  }

  function updateChart() {
    chart?.setOption(getChartOptions(), { notMerge: true });
  }

  function handleTimeRangeChange(e: Event) {
    const detail = (e as CustomEvent).detail as { start: string; end: string } | null;
    startMonth = detail?.start;
    endMonth = detail?.end;
    updateChart();
  }

  onMount(() => {
    chart = echarts.init(chartContainer);
    chart.setOption(getChartOptions());
    const resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartContainer);
    const themeObserver = new MutationObserver(() => updateChart());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('timerange-change', handleTimeRangeChange);
    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('timerange-change', handleTimeRangeChange);
      chart?.dispose();
    };
  });
</script>

<div class="rounded-xl border border-(--color-border) bg-(--color-surface) p-6">
  <h3 class="mb-4 text-lg font-semibold text-(--color-text-primary)">岗位类型分布趋势</h3>
  <div bind:this={chartContainer} class="h-[400px] w-full"></div>
</div>
