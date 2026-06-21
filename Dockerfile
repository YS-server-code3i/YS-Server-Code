FROM codercom/code-server:latest

# تحديد المنفذ الذي تستمع له منصة Railway تلقائياً
EXPOSE 8080

# أمر تشغيل السيرفر وتوجيهه للعمل على المنفذ الصحيح
CMD ["code-server", "--bind-addr", "0.0.0.0:8080"]

