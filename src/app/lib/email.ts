export async function sendEmail(to: string, subject: string, html: string) {
  // Implementa nodemailer aquí si deseas. Por ahora, solo mostramos en consola.
  console.log("=== EMAIL ===");
  console.log("To:", to);
  console.log("Subject:", subject);
  console.log("HTML:", html);
  console.log("=============");
}
