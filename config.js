window.STAGE1=Object.freeze({"url": "https://ikxmzapfmgqnnrsttuxc.supabase.co", "key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlreG16YXBmbWdxbm5yc3R0dXhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MjM5MDksImV4cCI6MjEwODE5OTkwOX0.VSE1PTiG6cIBqzrg-W0jexxzuFLE0cbIcc3pXoie7u8"});
window.EVROVET_UI2_CONFIG=Object.freeze({
  roleLabels:Object.freeze({
    head:'Руководитель',
    admin:'Администратор',
    doctor:'Врач',
    assistant_clinical:'Клинический ассистент',
    assistant_tech:'Технический ассистент',
    callcenter:'Колл-центр',
    courier:'Специалист АХО'
  }),
  moduleBuilt:Object.freeze({
    evening_report:true,
    cash_acceptance:true,
    appointments:true,
    callcenter_shift:true,
    schedule:true,
    accruals:true,
    where_i_work:true,
    my_schedule:true,
    my_accruals:true,
    head_money:true,
    head_reports:true,
    head_cash_safe:true,
    head_payroll:true,
    people_roles:true,
    head_collections:true,
    head_schedule:true,
    vaccines:true,
    vaccines_all_branches:true,
    vaccines_input:false,
    dose_calculator:true,
    supplies:true,
    analytics:true,
    supplies_all_requests:true,
    supply_order:false,
    modules_roles:false,
    birthdays:false
  }),
  roleTiles:Object.freeze({
    /* 2.0, решение Михаила 17.11: главная руководителя на плитках — Финансы / Препараты / Клиника */
    head:Object.freeze(['head_money','analytics','head_cash_safe','head_payroll','head_reports','head_collections','evening_report','vaccines_all_branches','supplies','dose_calculator','head_schedule','my_accruals','people_roles','birthdays']),
    /* 2.0, свод §17 (слово Михаила 17.11): у всех, кроме руководителя, главная сверху вниз — РАБОТА → ПРЕПАРАТЫ → КЛИНИКА (График, затем Мои начисления).
       Раздел плитки определяется функцией homeTileSection (home.js); порядок плиток внутри раздела = порядок в этом списке. */
    admin:Object.freeze(['cash_acceptance','evening_report','vaccines','supplies','my_schedule','my_accruals']),
    doctor:Object.freeze(['appointments','vaccines','dose_calculator','supplies','my_schedule','my_accruals']),
    assistant_clinical:Object.freeze(['vaccines','supplies','my_schedule','my_accruals']),
    assistant_tech:Object.freeze(['vaccines','supplies','my_schedule','my_accruals']),
    /* 2.0, п.15: график (плановые дни) и отметка выхода — разные вещи; отметка — большая кнопка на главной */
    callcenter:Object.freeze(['vaccines','my_schedule','my_accruals','callcenter_shift']),
    courier:Object.freeze(['my_accruals','vaccines_all_branches','supplies_all_requests','supply_order'])
  }),
  slogans:Object.freeze([
    'Ваша смена — наша забота',
    'Мы ценим вас каждый день',
    'Спасибо, что вы с нами',
    'Вы — сердце нашей клиники',
    'Мы рядом в каждой смене',
    'Вы делаете мир добрее',
    'С заботой о вашей работе',
    'Сделано для вас',
    'Ваша смена стала проще',
    'Всё под рукой — для вас'
  ]),
  sloganRotate:true,
  /* Кто не входит в «Остаток к выплате» сейфа (свод §14) — теперь на сервере (ev_cash_excluded_people → ev_cash_exclusions), в коде номеров нет. */
  /* Ведомость (свод §13): человек с двумя ролями стоит в одной группе — по основной роли.
     Порядок групп и исключения по человеку (номер -> роль). сотрудник с ролями админ+врач — администратор; КЦ, выходящий админом, — колл-центр; врач, выходящий ассистентом, — врач. */
  primaryRoleOrder:Object.freeze(['callcenter','admin','doctor','assistant','outsource']),
  primaryRoleByPerson:Object.freeze({}),
  navByRole:Object.freeze({
    default:Object.freeze(['home','schedule','accruals','menu']),
    courier:Object.freeze(['home','accruals','menu']),
    head:Object.freeze(['home','schedule','accruals','menu'])
  })
});
