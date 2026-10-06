#!/usr/bin/env bash
if [ "${1:-}" = --handling-delivered ]; then exit 0; fi
printf 'arm=%s\n' "$$" >> "$FM_ARM_LOG"
n=$(grep -c '^arm=' "$FM_ARM_LOG")
if [ "$n" -eq 1 ]; then
  printf 'watcher: started pid=%s (beacon fresh)\n' "$$"
  while [ ! -e "$FM_TRIGGER" ]; do sleep 0.05; done
  printf '%s\n' "$FM_TEST_REASON"
  exit 0
fi
printf 'watcher: started pid=%s (beacon fresh) recovery-generation=g%s\n' "$$" "$n"
trap 'exit 0' TERM INT
while [ ! -e "$FM_STOP" ]; do sleep 0.1; done
