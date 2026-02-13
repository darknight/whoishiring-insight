<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface DataPoint {
    yearMonth: string;
    count: number;
    percentage: number;
  }

  interface Props {
    data: DataPoint[];
  }

  let { data }: Props = $props();

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
    const filtered = filterByRange(data);
    const months = filtered.map((d) => d.yearMonth);

    return {
      backgroundColor: 'transparent',
      textStyle: { color: dark ? '#a3a3a3' : '#4b5563' },
      tooltip: {
        trigger: 'axis',
        backgroundColor: dark ? '#1f2937' : '#fff',
        borderColor: dark ? '#374151' : '#e5e7eb',
        textStyle: { color: dark ? '#e5e7eb' : '#1f2937' },
        formatter: (params: any) => {
          const items = Array.isArray(params) ? params : [params];
          let html = `<div style="font-weight:600;margin-bottom:4px">${items[0].axisValue}</div>`;
          for (const item of items) {
            html += `<div>${item.marker} ${item.seriesName}: <b>${item.value}${item.seriesName === '占比' ? '%' : ''}</b></div>`;
          }
          return html;
        },
      },
      legend: {
        bottom: 0,
        textStyle: { color: dark ? '#a3a3a3' : '#4b5563' },
      },
      grid: { left: 48, right: 48, top: 40, bottom: 48 },
      xAxis: {
        type: 'category',
        data: months,
        axisLine: { lineStyle: { color: dark ? '#374151' : '#e5e7eb' } },
        axisLabel: {
          formatter: (v: string) => {
            const [y, m] = v.split('-');
            return m === '01' ? y : '';
          },
        },
      },
      yAxis: [
        {
          type: 'value',
          name: '数量',
          splitLine: { lineStyle: { color: dark ? '#1f293780' : '#f3f4f6' } },
        },
        {
          type: 'value',
          name: '占比(%)',
          splitLine: { show: false },
          axisLabel: { formatter: '{value}%' },
        },
      ],
      series: [
        {
          name: '数量',
          type: 'bar',
          data: filtered.map((d) => d.count),
          color: '#3b82f6',
          barMaxWidth: 20,
          itemStyle: { borderRadius: [2, 2, 0, 0] },
        },
        {
          name: '占比',
          type: 'line',
          yAxisIndex: 1,
          data: filtered.map((d) => d.percentage),
          color: '#f59e0b',
          symbol: 'none',
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.1 },
        },
      ],
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
  <h3 class="mb-4 text-lg font-semibold text-(--color-text-primary)">远程岗位趋势</h3>
  <div bind:this={chartContainer} class="h-[400px] w-full"></div>
</div>
