import type { EmailMessage } from './index';

// Тексты писем. Приглашение — дословно из документа «Контент лендинга по блокам», раздел 4.

export function invitationEmail(to: string, link: string): EmailMessage {
  return {
    to,
    subject: 'Ваш личный кабинет в Институте кадровых решений',
    text: [
      'Здравствуйте! Мы подготовили для вас личный кабинет: в нём статус поиска, кандидаты и документы. ' +
        'Задайте пароль по ссылке, она действует 72 часа. Если ссылка не открывается, напишите мне в Telegram.',
      '',
      link,
      '',
      'Telegram: @kateriniya',
    ].join('\n'),
  };
}

export function loginCodeEmail(to: string, code: string): EmailMessage {
  return {
    to,
    subject: `Код входа: ${code}`,
    text: [
      `Код для входа в кабинет Института кадровых решений: ${code}`,
      '',
      'Код действует 10 минут. Если вы не входили в кабинет, срочно смените пароль и сообщите команде.',
    ].join('\n'),
  };
}

export function passwordResetEmail(to: string, link: string): EmailMessage {
  return {
    to,
    subject: 'Восстановление пароля',
    text: [
      'Чтобы задать новый пароль для кабинета Института кадровых решений, откройте ссылку. Она действует 1 час.',
      '',
      link,
      '',
      'Если вы не запрашивали восстановление, просто проигнорируйте это письмо.',
    ].join('\n'),
  };
}
