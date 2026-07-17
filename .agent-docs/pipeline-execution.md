# Execution Engine & Multi-Round Orchestration Loops

## Subgoal Decomposition
When a system execution request is compiled through the chat input, the agent bypasses monolithic generation. It runs a structured multi-round parsing pipeline:

1.  **Analyze System Intent:** Break down complex multi-stage tasks into a declarative array of sub-tasks.
2.  **Perception Check:** Assess the current local folder environments or target active application paths.
3.  **Execution Stringing:** Run sequential processing loops, capturing runtime output variables from completed tasks to adapt subsequent operations on-the-spot.

```python
# Reference Pattern for Local Task Loop
while not task_pipeline.is_complete():
    current_subgoal = task_pipeline.get_next()
    # Check Active System Permission Mode
    if system_mode == "Review":
        user_approved = request_ui_permission(current_subgoal)
        if not user_approved:
            break
            
    # Execute operation within designated boundaries
    execution_result = execute_local_subgoal(current_subgoal, target_environment)
    task_pipeline.update_state(current_subgoal, execution_result)