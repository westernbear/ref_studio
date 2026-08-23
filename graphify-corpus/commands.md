# Handoff commands

Happy QA:

```powershell
powershell -NoProfile -File D:\motions\.omo\fixtures\plan-qa\validate-handoff-package.ps1 -PackageRoot D:\motions\.omo\evidence\final-handoff-package
```

Failure QA:

```powershell
powershell -NoProfile -File D:\motions\.omo\fixtures\plan-qa\run-task-failure.ps1 -Task 12 -Fixture D:\motions\.omo\fixtures\plan-qa\task-12\failure.json
```

The happy command exits zero. The failure command exits one and emits `HANDOFF_INTEGRITY_FAILURE`.
