#!/bin/bash

PID=$1
LOGFILE="usage.log"

# clean log if exists
> "$LOGFILE"

# function to calculate averages on exit
finish() {
  echo ""
  echo "Calculating averages..."

  awk -F, '
  {
    cpu+=$3; mem+=$4; rss+=$5; n++
  }
  END {
    avg_cpu = cpu/n
    avg_mem = mem/n
    avg_rss_mb = (rss/n)/1024

    cpu_cost = (avg_cpu/100)*1.0
    ram_cost = (avg_rss_mb/512)*1.0
    total_cost = cpu_cost + ram_cost

    printf "Average CPU%%: %.2f\n", avg_cpu
    printf "Average MEM%%: %.2f\n", avg_mem
    printf "Average RSS: %.2f MB\n", avg_rss_mb
    printf "Estimated monthly cost: $%.4f (CPU $%.4f + RAM $%.4f)\n", total_cost, cpu_cost, ram_cost
  }' "$LOGFILE"
}

trap finish EXIT

echo "Monitoring PID $PID... Press Ctrl+C to stop."

while true; do
  ps -o pid,pcpu,pmem,rss --no-headers -p "$PID" | \
  awk -v date="$(date '+%Y-%m-%d %H:%M:%S')" '{printf "%s,%s,%s,%s,%s\n", date, $1, $2, $3, $4}' \
  >> "$LOGFILE"
  sleep 1
done

