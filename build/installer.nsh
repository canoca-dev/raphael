; Kaldırınca Windows açılışında başlatma kaydını da sil (Raphael bunu kendisi ekliyor).
; Güncelleme sırasında eski sürüm de kaldırılır; o zaman kayıt yerinde kalmalı.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Raphael"
  ${endIf}
!macroend
