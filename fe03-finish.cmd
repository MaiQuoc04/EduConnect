@echo off
rem FE-03: finish the lead-review changes (remove old layered files, commit, push). develop is already merged.
rem Run once from D:\EduConnect:  .\fe03-finish.cmd   (the file deletes itself when everything succeeds)
cd /d "%~dp0"
echo [1/3] Remove the old layered files
git rm -r -q package-lock.json server/scripts/check-cols.js server/scripts/check-tables.js server/src/routes server/src/validators server/src/controllers server/src/services server/src/repositories server/src/models server/src/constants server/src/middlewares/validate.js server/src/utils/text.js server/src/utils/validation.js || goto fail
echo [2/3] Commit
git add -A || goto fail
git reset -q -- fe03-finish.cmd
if exist server\scripts\routes.code-workspace git reset -q -- server/scripts/routes.code-workspace
git commit -m "FE-03: move code into modules/teacher per lead review, reuse removeAccents and normalizePhone, remove stray files" || goto fail
echo [3/3] Push
git push || goto fail
echo.
echo DONE
git log --oneline -3
(goto) 2>nul & del "%~f0"
:fail
echo.
echo FAILED at the step above - send Claude a screenshot of this window.
exit /b 1
