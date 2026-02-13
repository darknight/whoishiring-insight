<script lang="ts">
  import { onMount } from 'svelte';
  import * as echarts from 'echarts';

  interface TrendItem {
    yearMonth: string;
    count: number;
  }

  interface Props {
    data: TrendItem[];
    startMonth?: string;
    endMonth?: string;
  }

  let { data, startMonth, endMonth }: Props = $props();

  let chartContainer: HTMLDivElement;
  let chart: echarts.ECharts;

  let filteredData = $derived.by(() => {
    let result = data;
    if (startMonth) {
      result = result.filter((d) => d.yearMonth >= startMonth);
    }
    if (endMonth) {
      result = result.filter((d) => d.yearMonth <= endMonth);
    }
    return result;
  });

  function isDark(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  function getChartOptions(): echarts.EChartsOption {
    const dark = isDark();
    const months = filteredData.map((d) => d.yearMonth);
    const counts = filteredData.map((d) => d.count);

    return {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily:
          'Inter, SF Pro Display, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
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
          const p = Array.isArray(params) ? params[0] : params;
          return `<div style="font-variant-numeric:tabular-nums">
            <span style="color:${dark ? '#a3a3a3' : '#4b5563'}">${p.name}</span><br/>
            <span style="font-weight:600;font-size:15px">${p.value}</span>
            <span style="color:${dark ? '#525252' : '#9ca3af'};font-size:12px"> 条招聘</span>
          </div>`;
        },
      },
      grid: {
        left: 48,
        right: 24,
        top: 16,
        bottom: 32,
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
            // Show labels for January of each year, or at reasonable intervals
            const m = months[index];
            if (!m) return false;
            if (months.length <= 24) return index % 2 === 0;
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
      series: [
        {
          type: 'line',
          data: counts,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: {
            width: 2,
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#3b82f6' },
              { offset: 1, color: '#60a5fa' },
            ]),
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: dark ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.12)' },
              { offset: 1, color: 'rgba(59,130,246,0)' },
            ]),
          },
          emphasis: {
            itemStyle: {
              color: '#3b82f6',
              borderColor: '#fff',
              borderWidth: 2,
            },
          },
        },
      ],
    };
  }

  $effect(() => {
    // Track reactive dependency
    filteredData;
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
