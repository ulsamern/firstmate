#!/usr/bin/env bash
# usage: run-case.sh <case> <queue-key> <reason> [replied|missing|none] [hold]
set -u
H=/tmp/fm-pi-prio-harness; WT=/home/nino/.no-mistakes/worktrees/f11842f15ab3/01M48DFA3KEEYKYWER9RZ3XZDR
CASE=$1 KEY=$2 REASON=$3 NOTE=${4:-none} HOLD=${5:-complete}
LAB=$(mktemp -d /tmp/fm-lab.XXXXXX); echo "$LAB" > "$H/$CASE.lab"
mkdir -p "$LAB/root/bin" "$LAB/home/state/inbox/.replies" "$LAB/home/config" "$LAB/project" "$LAB/agent" "$LAB/sessions"
cp "$H/arm.sh" "$LAB/root/bin/fm-watch-arm.sh"; cp "$WT/bin/fm-operational-input.sh" "$LAB/root/bin/"
ID=1791015324-human
[ "$NOTE" = missing ] || printf 'id=%s\n--\nCaptain asks: what is the status of task-a?\n' "$ID" > "$LAB/home/state/inbox/$ID.note"
[ "$NOTE" = replied ] && printf 'answered\n' > "$LAB/home/state/inbox/.replies/$ID"
printf '1\t1\tcheck\t%s\t%s\n' "$KEY" "$REASON" > "$LAB/home/state/.wake-queue"
cat > "$LAB/launch.sh" <<EOF
#!/usr/bin/env bash
echo \$\$ > "$LAB/home/state/.lock"
cd "$LAB/project"
exec env -u NO_MISTAKES_GATE -u FM_STATE_OVERRIDE -u FM_DATA_OVERRIDE -u FM_CONFIG_OVERRIDE -u FM_PROJECTS_OVERRIDE \
  FM_HOME="$LAB/home" FM_ROOT_OVERRIDE="$LAB/root" FM_ARM_LOG="$LAB/arm.log" FM_TRIGGER="$LAB/trigger" FM_STOP="$LAB/stop" \
  FM_TEST_REASON="$REASON" PROBE_LOG="$LAB/probe.log" PROBE_HOLD="$HOLD" PI_CODING_AGENT_DIR="$LAB/agent" PI_OFFLINE=1 \
  pi --approve --no-context-files --no-skills --no-prompt-templates --no-extensions \
  -e "$WT/.pi/extensions/fm-primary-pi-watch.ts" -e "$H/probe.ts" --session-dir "$LAB/sessions"
EOF
chmod +x "$LAB/launch.sh"
tmux -L "fm-lab-$CASE" new-session -d -s primary -x 180 -y 50 "$LAB/launch.sh; sleep 600"
