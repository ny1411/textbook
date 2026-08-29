import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from evals.eval_retrieval import evaluate_retrieval
from evals.eval_generation import evaluate_generation
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()
REPORTS_DIR = Path(__file__).resolve().parent / "reports"


def evaluate_retrieval_recall(k: int = 5) -> Dict[str, Any]:
    """Top-level function to evaluate retrieval recall across strategies."""
    return evaluate_retrieval()


def evaluate_generation_faithfulness() -> Dict[str, Any]:
    """Top-level function to evaluate generation faithfulness and relevance."""
    return evaluate_generation()


def save_reports(full_report: Dict[str, Any]):
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = REPORTS_DIR / f"eval_report_{timestamp}.json"
    latest_json = REPORTS_DIR / "latest_eval_report.json"
    
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(full_report, f, indent=2)
    with open(latest_json, "w", encoding="utf-8") as f:
        json.dump(full_report, f, indent=2)
        
    md_path = REPORTS_DIR / "latest_eval_report.md"
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(f"# Textbook RAG Evaluation Report\n\n")
        f.write(f"**Generated:** {full_report['timestamp']}\n\n")
        f.write(f"## 1. Retrieval Performance Benchmark\n\n")
        f.write("| Strategy | Recall@1 | Recall@3 | Recall@5 | MRR@5 | HitRate@5 | NDCG@5 |\n")
        f.write("| --- | --- | --- | --- | --- | --- | --- |\n")
        for strat, m in full_report["retrieval"].items():
            f.write(f"| {strat} | {m['Recall@1']:.3f} | {m['Recall@3']:.3f} | {m['Recall@5']:.3f} | {m['MRR@5']:.3f} | {m['HitRate@5']:.3f} | {m['NDCG@5']:.3f} |\n")
        
        f.write(f"\n## 2. Generation & Faithfulness Benchmark\n\n")
        gen = full_report["generation"]
        f.write(f"- **Mean Faithfulness:** `{gen['Mean_Faithfulness']:.3f}`\n")
        f.write(f"- **Mean Answer Relevance:** `{gen['Mean_Answer_Relevance']:.3f}`\n")
        f.write(f"- **Mean Citation Accuracy:** `{gen['Mean_Citation_Accuracy']:.3f}`\n")
        f.write(f"- **Negative Rejection Accuracy:** `{gen['Rejection_Accuracy']:.1%}`\n")


def run_all_evals():
    start_time = time.time()
    console.print(Panel.fit("[bold magenta]📘 Textbook RAG Evaluation Suite (Phase 13)[/bold magenta]\n[dim]Benchmarking Retrieval (Recall/MRR) & Generation (Faithfulness/Relevance)[/dim]"))

    console.print("\n[bold cyan]1. Evaluating Retrieval Strategies...[/bold cyan]")
    retrieval_results = evaluate_retrieval()
    
    ret_table = Table(title="Retrieval Performance Scorecard")
    ret_table.add_column("Strategy", style="bold cyan")
    ret_table.add_column("Recall@1", justify="center")
    ret_table.add_column("Recall@3", justify="center")
    ret_table.add_column("Recall@5", justify="center", style="bold green")
    ret_table.add_column("MRR@5", justify="center", style="bold yellow")
    ret_table.add_column("HitRate@5", justify="center")
    ret_table.add_column("NDCG@5", justify="center", style="bold magenta")
    
    for strat, m in retrieval_results.items():
        ret_table.add_row(
            strat,
            f"{m['Recall@1']:.3f}",
            f"{m['Recall@3']:.3f}",
            f"{m['Recall@5']:.3f}",
            f"{m['MRR@5']:.3f}",
            f"{m['HitRate@5']:.3f}",
            f"{m['NDCG@5']:.3f}",
        )
    console.print(ret_table)

    console.print("\n[bold cyan]2. Evaluating Generation & Citations with LLM-as-a-Judge...[/bold cyan]")
    generation_results = evaluate_generation()
    
    gen_table = Table(title="Generation & Groundedness Scorecard")
    gen_table.add_column("Metric", style="bold cyan")
    gen_table.add_column("Score", justify="center", style="bold green")
    gen_table.add_column("Target Threshold", justify="center", style="yellow")
    gen_table.add_column("Status", justify="center")
    
    gen_summary = [
        ("Faithfulness (Hallucination Resistance)", f"{generation_results['Mean_Faithfulness']:.3f}", ">= 0.85", "✅ PASS" if generation_results['Mean_Faithfulness'] >= 0.85 else "⚠️ REVIEW"),
        ("Answer Relevance", f"{generation_results['Mean_Answer_Relevance']:.3f}", ">= 0.85", "✅ PASS" if generation_results['Mean_Answer_Relevance'] >= 0.85 else "⚠️ REVIEW"),
        ("Citation Accuracy", f"{generation_results['Mean_Citation_Accuracy']:.3f}", ">= 0.80", "✅ PASS" if generation_results['Mean_Citation_Accuracy'] >= 0.80 else "⚠️ REVIEW"),
        ("Negative Rejection Accuracy", f"{generation_results['Rejection_Accuracy']:.1%}", ">= 90%", "✅ PASS" if generation_results['Rejection_Accuracy'] >= 0.9 else "⚠️ REVIEW"),
    ]
    
    for metric, score, target, status in gen_summary:
        gen_table.add_row(metric, score, target, status)
    console.print(gen_table)

    elapsed = time.time() - start_time
    full_report = {
        "timestamp": datetime.now().isoformat(),
        "duration_seconds": elapsed,
        "retrieval": retrieval_results,
        "generation": generation_results,
    }
    
    save_reports(full_report)
    console.print(f"\n[bold green]✨ Evals completed in {elapsed:.2f}s! Reports saved to evals/reports/[/bold green]\n")


if __name__ == "__main__":
    run_all_evals()
