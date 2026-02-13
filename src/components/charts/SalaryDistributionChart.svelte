<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface SalaryItem {
    range: string;
    count: number;
  }

  interface Props {
    data: SalaryItem[];
  }

  let { data }: Props = $props();

  let chartContainer: HTMLDivElement;
  let chart: echarts.ECharts;

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function getChartOptions(): echarts.EChartsOption {
    const dark = isDark();

    return {
      backgroundColor: 'transparent',
      textStyle: { color: dark ? '#a3a3a3' : '#4b5563' },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: dark ? '#1f2937' : '#fff',
        borderColor: dark ? '#374151' : '#e5e7eb',
        textStyle: { color: dark ? '#e5e7eb' : '#1f2937' },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          return `<strong>${p.name}</strong><br/>岗位数量：${p.value}`;
        },
      },
      grid: { left: 48, right: 16, top: 24, bottom: 32 },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.range),
        axisLine: { lineStyle: { color: dark ? '#374151' : '#e5e7eb' } },
        axisLabel: { color: dark ? '#a3a3a3' : '#6b7280' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: dark ? '#1f293780' : '#f3f4f6' } },
        axisLabel: { color: dark ? '#a3a3a3' : '#6b7280' },
      },
      series: [
        {
          type: 'bar',
          data: data.map((d) => d.count),
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#8b5cf6' },
              { offset: 1, color: '#a78bfa' },
            ]),
            borderRadius: [4, 4, 0, 0],
          },
          barMaxWidth: 48,
          label: {
            show: true,
            position: 'top',
            color: dark ? '#a3a3a3' : '#6b7280',
            fontSize: 11,
          },
        },
      ],
    };
  }

  function updateChart() {
    chart?.setOption(getChartOptions(), { notMerge: true });
  }

  onMount(() => {
    chart = echarts.init(chartContainer);
    chart.setOption(getChartOptions());
    const resizeObserver = new ResizeObserver(() => chart?.resize());
    resizeObserver.observe(chartContainer);
    const observer = new MutationObserver(() => updateChart());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { resizeObserver.disconnect(); observer.disconnect(); chart?.dispose(); };
  });
</script>

<div bind:this={chartContainer} class="h-[350px] w-full"></div>
