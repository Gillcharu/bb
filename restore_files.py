import json

log_file = "/Users/charugill/.gemini/antigravity-ide/brain/f9b27044-9e53-4a47-b585-f267d763dfa0/.system_generated/logs/transcript_full.jsonl"

with open(log_file, "r") as f:
    for i, line in enumerate(f):
        if "write_to_file" in line and ("VendorLobby.tsx" in line or "VendorLiveConsole.tsx" in line):
            try:
                data = json.loads(line)
                step = data.get("step_index")
                print(f"Step {step} had write_to_file!")
            except Exception as e:
                pass
