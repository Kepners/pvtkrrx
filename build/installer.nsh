!macro customInstall
  DetailPrint "Ensuring Windows LAN access rules for PVTKRRX..."
  nsExec::ExecToLog '"$appExe" --pvtkrrx-network-access-only'
  Pop $0
  StrCmp $0 "0" +2
    DetailPrint "PVTKRRX network-access bootstrap exited with code $0"
!macroend
