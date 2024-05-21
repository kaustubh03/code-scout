from datasets import load_dataset
import pandas as pd
from pathlib import Path

dataset = load_dataset("teknium/trismegistus-project")
print(dataset)

df = pd.DataFrame(dataset["train"])
# print(df.iloc[0]["system_prompt_used"], "\n", df.iloc[0]["conversations"])
# Split the quetion and answer into separate columns
df[["question", "answer"]] = pd.DataFrame(df["conversations"].tolist(), index=df.index)

# Only keep the 'value' portion of the JSON
df["question"] = df["question"].apply(lambda x: x["value"])
df["answer"] = df["answer"].apply(lambda x: x["value"])

# print(df[["system_prompt_used", "question", "answer"]])

def generate_prompt(row: pd.Series) -> str:
    "Format to Gemma's chat template"
    return """<bos><start_of_turn>user
## Instructions
{}
## User
{}<end_of_turn>
<start_of_turn>model
{}<end_of_turn><eos>""".format(row["system_prompt_used"], row["question"], row["answer"])


df["text"] = df.apply(generate_prompt, axis=1)

# Let's see what the model will be trained on
# print(df["text"].iloc[0])

Path("data").mkdir(exist_ok=True)

split_ix = int(len(df) * 0.9)
# shuffle data
data = df.sample(frac=1, random_state=42)
train, valid = data[:split_ix], data[split_ix:]

# Save train and valid dataset as jsonl files
train[["text"]].to_json("data/train.jsonl", orient="records", lines=True, force_ascii=False)
valid[["text"]].to_json("data/valid.jsonl", orient="records", lines=True, force_ascii=False)

# Read the first line of the train.jsonl file
with open("data/train.jsonl", "r") as f:
    first_line = f.readline()
    print(first_line)
