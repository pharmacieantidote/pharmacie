# test_impression.py
import os
import django
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'gestion_pharmacie.settings')
django.setup()

from escpos.printer import Usb

print("UID:", os.getuid())
print("GID:", os.getgid())

try:
    p = Usb(0x1fc9, 0x2016)
    p.text("Test depuis script autonome\n")
    p.cut()
    p.close()
    print("✅ Succès !")
except Exception as e:
    print("❌ Erreur:", e)