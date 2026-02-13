<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface CityRanking {
    name: string;
    count: number;
  }

  interface Props {
    data: CityRanking[];
    topN?: number;
  }

  let { data, topN = 15 }: Props = $props();

  let chartContainer: HTMLDivElement;
  let chart: echarts.ECharts;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  let displayData = $derived(data.slice(0, topN).reverse());

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function getChartOptions(): echarts.EChartsOption {
    const dark = isDark();
    const cities = displayData.map((d) => d.name);
    const counts = displayData.map((d) => d.count);
    const maxCount = Math.max(...counts);

    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily:
          'Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        color: dark ? '#a3a3a3' : '#4b5563',
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: dark ? '#1a1a1a' : '#ffffff',
        borderColor: dark ? '#262626' : '#e5e7eb',
        textStyle: {
          color: dark ? '#f5f5f5' : '#111827',
          fontSize: 13,
        },
        formatter(params: any) {
          const p = Array.isArray(params) ? params[0] : params;
          return `<div style="font-variant-numeric:tabular-nums">
            <span style="font-weight:600">${p.name}</span><br/>
            <span style="font-size:15px;font-weight:600">${p.value}</span>
            <span style="color:${dark ? '#525252' : '#9ca3af'};font-size:12px"> 条招聘</span>
          </div>`;
        },
      },
      grid: {
        left: 8,
        right: 48,
        top: 8,
        bottom: 8,
        containLabel: true,
      },
      xAxis: {
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
      yAxis: {
        type: 'category',
        data: cities,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: dark ? '#a3a3a3' : '#4b5563',
          fontSize: 12,
          fontWeight: 500,
        },
      },
      series: [
        {
          type: 'bar',
          data: counts.map((value, index) => ({
            value,
            itemStyle: {
              color: COLORS[index % COLORS.length],
              borderRadius: [0, 4, 4, 0],
            },
          })),
          barMaxWidth: 24,
          label: {
            show: true,
            position: 'right',
            fontSize: 11,
            fontWeight: 600,
            color: dark ? '#a3a3a3' : '#4b5563',
            formatter: '{c}',
          },
        },
      ],
    };
  }

  $effect(() => {
    displayData;
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

<div bind:this={chartContainer} class="h-[520px] w-full"></div>
