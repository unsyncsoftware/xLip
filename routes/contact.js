import express from 'express';
import { Resend } from 'resend';

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

router.post('/contact', async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message)
    return res.status(400).json({ error: 'Name, email and message are required.' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.status(400).json({ error: 'Invalid email address.' });

  if (message.length > 2000)
    return res.status(400).json({ error: 'Message too long (max 2000 characters).' });

  try {
    await resend.emails.send({
      from: 'xlip.uk Support <support@xlip.uk>',
      to: 'support@xlip.uk',
      replyTo: email,
      subject: `[Support] ${subject || 'New message'} — from ${name}`,
      html: `<div style="font-family:sans-serif;background:#0e1628;color:#cdd8f0;padding:40px;">
        <h2 style="color:#b8d900;font-family:monospace;">xlip.uk Support</h2>
        <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
        <p><strong>Subject:</strong> ${subject || '(none)'}</p>
        <hr style="border-color:#1e2d47;">
        <p style="white-space:pre-wrap;">${message.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>
      </div>`
    });

    await resend.emails.send({
      from: 'xlip.uk Support <support@xlip.uk>',
      to: email,
      subject: 'We received your message — xlip.uk Support',
      html: `<div style="font-family:sans-serif;background:#0e1628;color:#cdd8f0;padding:40px;">
        <h2 style="color:#b8d900;font-family:monospace;">xlip.uk</h2>
        <h3>Hi ${name}, we got your message.</h3>
        <p style="color:#5a6a85;">We'll get back to you within 24–48 hours.</p>
        <p style="color:#3a4a65;font-size:12px;">— xlip.uk Support</p>
      </div>`
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[Contact] Error:', err);
    res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
});

export default router;
